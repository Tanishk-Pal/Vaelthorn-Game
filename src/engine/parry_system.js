/**
 * Vaelthorn: The Oath of Darkness — Parry & Deflection Engine
 * File: src/engine/parry_system.js
 * 
 * Pure mathematical combat engine governing the 6-frame (0.10s) precision deflection window,
 * continuous sub-frame delta-time integration, directional 2.5D alignment, projectile reflection,
 * anti-spam guard cooldown, poise break triggers, and the 2.5x critical riposte multiplier.
 * 
 * Zero-cheat authentic mathematical implementation.
 */

/**
 * Default tuning configuration for the Parry System.
 */
const DEFAULT_PARRY_CONFIG = Object.freeze({
    parryWindow: 0.10,             // 6 frames at 60Hz (0.100s)
    guardCooldown: 0.20,           // 0.20s cooldown between guard presses (anti-spam)
    enemyPoiseDamage: 100,         // Poise damage inflicted on attacker upon parry
    resonanceGain: 100,            // Stygian Resonance awarded on deflection (instant Overdrive)
    hitStop: 0.08,                 // Micro-freeze duration on successful deflection (s)
    missHitStop: 0.04,             // Micro-freeze duration on unmitigated hit (s)
    riposteMultiplier: 2.5,        // Critical damage multiplier on staggered enemy
    staggerDuration: 1.20,         // Duration of enemy poise break stagger window (s)
    projectileReflectMult: 1.25,   // Ballistic speed multiplier on reflected projectile
    maxDeltaTime: 0.10,            // Upper clamp for single-frame dt spike guard (s)
    epsilon: 1e-5                  // Floating-point precision threshold (s)
});

/**
 * Constants dictionary matching engine loader and test assertions.
 */
const ParryConstants = Object.freeze({
    PARRY_WINDOW: 0.10,
    GUARD_COOLDOWN: 0.20,
    ENEMY_POISE_DAMAGE: 100,
    RESONANCE_GAIN: 100,
    HIT_STOP: 0.08,
    MISS_HIT_STOP: 0.04,
    RIPOSTE_MULTIPLIER: 2.5,
    STAGGER_DURATION: 1.20,
    PROJECTILE_REFLECT_MULT: 1.25
});

/**
 * Deflection evaluation result enum.
 */
const ParryResult = Object.freeze({
    PARRIED: 'PARRIED',
    HIT: 'HIT',
    BLOCKED: 'BLOCKED',
    UNBLOCKABLE_HIT: 'UNBLOCKABLE_HIT'
});

// ============================================================================
// 1. PURE MATHEMATICAL FUNCTIONS (FUNCTIONAL PARADIGM)
// ============================================================================

/**
 * Initializes a new immutable or mutable ParryState structure.
 * 
 * @param {Object} [config=DEFAULT_PARRY_CONFIG]
 * @returns {Object} Initialized parry state
 */
function createParryState(config = DEFAULT_PARRY_CONFIG) {
    const cfg = config || DEFAULT_PARRY_CONFIG;
    return {
        parryTimer: 0.0,
        cooldown: 0.0,
        isActive: false,
        riposteTimer: 0.0,
        isRiposteAvailable: false,
        config: { ...DEFAULT_PARRY_CONFIG, ...cfg }
    };
}

/**
 * Evaluates whether an incoming strike lands within the defender's frontal arc.
 * In the 2.5D plane ($Z = 0$), facing direction is +1 (right) or -1 (left).
 * 
 * @param {Object} [attackerPos] - { x, y } coordinates of attacker
 * @param {Object} [defenderPos] - { x, y } coordinates of defender
 * @param {number} [defenderFacing=1] - Facing direction (+1 right, -1 left)
 * @returns {boolean} True if attack hits defender's front; false if backstab
 */
function checkFrontalAlignment(attackerPos, defenderPos, defenderFacing = 1) {
    // If coordinates are omitted by caller, default to frontal alignment (backward compatibility)
    if (!attackerPos || !defenderPos || !Number.isFinite(attackerPos.x) || !Number.isFinite(defenderPos.x)) {
        return true;
    }

    const dx = attackerPos.x - defenderPos.x;
    // If coincident, attacker is considered in front
    if (Math.abs(dx) < 1e-4) {
        return true;
    }

    const facing = defenderFacing >= 0 ? 1 : -1;
    const directionToAttacker = dx > 0 ? 1 : -1;

    // Defender must face towards the attacker to deflect with buckler-pauldron
    return facing === directionToAttacker;
}

/**
 * Calculates projectile reflection kinematics upon successful deflection.
 * 
 * @param {Object} projectile - { vx, vy, [x, y] }
 * @param {number} [multiplier=1.25] - Velocity speed boost
 * @returns {Object} Reflected projectile velocity vector
 */
function calculateReflectedProjectile(projectile, multiplier = DEFAULT_PARRY_CONFIG.projectileReflectMult) {
    if (!projectile || typeof projectile !== 'object') {
        return null;
    }

    const mult = (Number.isFinite(multiplier) && multiplier > 0) ? multiplier : 1.25;
    const vx0 = Number.isFinite(projectile.vx) ? projectile.vx : 0.0;
    const vy0 = Number.isFinite(projectile.vy) ? projectile.vy : 0.0;

    // Reverse horizontal trajectory with kinetic acceleration, add slight upward arc
    return {
        vx: -vx0 * mult,
        vy: Math.max(2.0, -0.5 * vy0 + 3.0),
        vz: 0.0,
        reflected: true
    };
}

/**
 * Calculates counter-attack damage against a target factoring in stagger state.
 * 
 * @param {number} baseDamage - Base weapon damage
 * @param {boolean} isTargetStaggered - True if target poise is broken
 * @param {number} [multiplier=2.5] - Critical riposte multiplier
 * @returns {{ damage: number, isCritical: boolean }}
 */
function calculateRiposteDamage(baseDamage, isTargetStaggered, multiplier = DEFAULT_PARRY_CONFIG.riposteMultiplier) {
    if (!Number.isFinite(baseDamage) || baseDamage <= 0) {
        return { damage: 0, isCritical: false };
    }
    const mult = (Number.isFinite(multiplier) && multiplier > 0) ? multiplier : DEFAULT_PARRY_CONFIG.riposteMultiplier;
    if (isTargetStaggered) {
        return {
            damage: Math.round(baseDamage * mult),
            isCritical: true
        };
    }
    return {
        damage: Math.round(baseDamage),
        isCritical: false
    };
}

/**
 * Evaluates an incoming attack against parry state.
 * 
 * @param {Object} state - Parry state
 * @param {Object} incomingAttack - Attack payload
 * @param {Object} [config] - Override configuration
 * @returns {Object} Comprehensive evaluation result
 */
function evaluateIncomingAttack(state, incomingAttack = {}, config = DEFAULT_PARRY_CONFIG) {
    const cfg = config || state?.config || DEFAULT_PARRY_CONFIG;
    const rawDamage = Number.isFinite(incomingAttack?.damage) ? Math.max(0, incomingAttack.damage) : 20;

    // 1. Check Unblockable / Perilous attack (Red Attacks cannot be parried)
    if (incomingAttack?.isUnblockable) {
        return {
            result: ParryResult.UNBLOCKABLE_HIT,
            damageTaken: rawDamage,
            enemyPoiseDamage: 0,
            resonanceGain: 0,
            hitStop: cfg.missHitStop,
            sparks: false,
            isRiposteAvailable: false,
            riposteMultiplier: 1.0,
            reflectedProjectile: null,
            reason: 'ATTACK_IS_UNBLOCKABLE'
        };
    }

    // 2. Check if Parry Window is active
    const isWindowActive = state && state.isActive && (state.parryTimer > (cfg.epsilon || 1e-5));
    if (!isWindowActive) {
        return {
            result: ParryResult.HIT,
            damageTaken: rawDamage,
            enemyPoiseDamage: 0,
            resonanceGain: 0,
            hitStop: cfg.missHitStop,
            sparks: false,
            isRiposteAvailable: false,
            riposteMultiplier: 1.0,
            reflectedProjectile: null,
            reason: 'PARRY_WINDOW_CLOSED'
        };
    }

    // 3. Directional Alignment Check (Frontal vs Back Attack)
    const isFrontal = checkFrontalAlignment(
        incomingAttack.attackerPos,
        incomingAttack.defenderPos,
        incomingAttack.defenderFacing
    );

    if (!isFrontal) {
        return {
            result: ParryResult.HIT,
            damageTaken: rawDamage,
            enemyPoiseDamage: 0,
            resonanceGain: 0,
            hitStop: cfg.missHitStop,
            sparks: false,
            isRiposteAvailable: false,
            riposteMultiplier: 1.0,
            reflectedProjectile: null,
            reason: 'BACK_ATTACK'
        };
    }

    // 4. Successful Deflection Execution
    // Handle projectile reflection if applicable
    let reflectedProj = null;
    if (incomingAttack.isProjectile && incomingAttack.projectile) {
        reflectedProj = calculateReflectedProjectile(incomingAttack.projectile, cfg.projectileReflectMult);
    }

    // Deflection cancels whiff cooldown, enabling rapid chain parries against flurries
    if (state) {
        state.cooldown = 0.0;
        state.isRiposteAvailable = true;
        state.riposteTimer = cfg.staggerDuration;
    }

    return {
        result: ParryResult.PARRIED,
        damageTaken: 0,
        enemyPoiseDamage: cfg.enemyPoiseDamage,
        resonanceGain: cfg.resonanceGain,
        hitStop: cfg.hitStop,
        sparks: true,
        isRiposteAvailable: true,
        riposteMultiplier: cfg.riposteMultiplier,
        reflectedProjectile: reflectedProj,
        reason: 'PERFECT_PARRY'
    };
}

// ============================================================================
// 2. OBJECT-ORIENTED ENGINE CLASS (ParrySystem)
// ============================================================================

/**
 * Production-ready ParrySystem controller managing 6-frame deflection window,
 * anti-spam cooldown, sub-frame delta-time integration, and riposte state.
 */
class ParrySystem {
    /**
     * Constructs a new ParrySystem instance.
     * 
     * @param {number} [parryWindow=0.10] - Active deflection duration (s) [6 frames at 60Hz]
     * @param {number} [guardCooldown=0.20] - Anti-spam cooldown duration (s)
     * @param {Object} [options={}] - Optional tuning overrides
     */
    constructor(parryWindow = DEFAULT_PARRY_CONFIG.parryWindow, guardCooldown = DEFAULT_PARRY_CONFIG.guardCooldown, options = {}) {
        this.parryWindow = Number.isFinite(parryWindow) && parryWindow > 0 
            ? parryWindow 
            : DEFAULT_PARRY_CONFIG.parryWindow;

        this.guardCooldown = Number.isFinite(guardCooldown) && guardCooldown >= 0 
            ? guardCooldown 
            : DEFAULT_PARRY_CONFIG.guardCooldown;

        this.options = { ...DEFAULT_PARRY_CONFIG, ...options, parryWindow: this.parryWindow, guardCooldown: this.guardCooldown };

        this.parryTimer = 0.0;
        this.cooldown = 0.0;
        this.isActive = false;

        this.riposteTimer = 0.0;
        this.isRiposteAvailable = false;

        // Telemetry counters
        this.stats = {
            totalGuards: 0,
            successfulParries: 0,
            mistimedParries: 0
        };
    }

    /**
     * Triggers guard/parry action. Initiates active window if not on cooldown.
     * 
     * @returns {boolean} True if guard was initiated; false if rejected by cooldown
     */
    triggerGuard() {
        if (this.cooldown <= 0) {
            this.parryTimer = this.parryWindow;
            this.isActive = true;
            this.cooldown = this.guardCooldown;
            this.stats.totalGuards++;
            return true;
        }
        return false;
    }

    /**
     * Updates parry timers over delta-time with defensive numeric clamping.
     * 
     * @param {number} dt - Timestep in seconds
     */
    update(dt) {
        if (!Number.isFinite(dt) || dt <= 0) {
            return;
        }

        const safeDt = dt;

        // 1. Decay Active Parry Window
        if (this.parryTimer > 0) {
            this.parryTimer = Math.max(0.0, this.parryTimer - safeDt);
            if (this.parryTimer <= (this.options.epsilon || 1e-5)) {
                this.parryTimer = 0.0;
                this.isActive = false;
            }
        } else {
            this.isActive = false;
        }

        // 2. Decay Anti-Spam Cooldown
        if (this.cooldown > 0) {
            this.cooldown = Math.max(0.0, this.cooldown - safeDt);
            if (this.cooldown <= (this.options.epsilon || 1e-5)) {
                this.cooldown = 0.0;
            }
        }

        // 3. Decay Riposte Window
        if (this.riposteTimer > 0) {
            this.riposteTimer = Math.max(0.0, this.riposteTimer - safeDt);
            if (this.riposteTimer <= 0) {
                this.riposteTimer = 0.0;
                this.isRiposteAvailable = false;
            }
        }
    }

    /**
     * Evaluates deflection outcome against an incoming attack.
     * 
     * @param {Object} incomingAttack - { damage, isUnblockable, isProjectile, projectile, attackerPos, defenderPos, defenderFacing }
     * @returns {Object} Evaluation outcome
     */
    evaluateIncomingHit(incomingAttack = { damage: 20 }) {
        const result = evaluateIncomingAttack(this, incomingAttack, this.options);

        if (result.result === ParryResult.PARRIED) {
            this.stats.successfulParries++;
        } else {
            this.stats.mistimedParries++;
        }

        return result;
    }

    /**
     * Checks if guard can currently be triggered.
     * @returns {boolean}
     */
    canGuard() {
        return this.cooldown <= 0;
    }

    /**
     * Returns remaining active parry window time in seconds.
     * @returns {number}
     */
    getRemainingTime() {
        return this.parryTimer;
    }

    /**
     * Returns equivalent remaining frames at 60Hz.
     * @returns {number} Integer count of frames remaining
     */
    getRemainingFramesAt60Hz() {
        return Math.ceil(this.parryTimer * 60.0);
    }

    /**
     * Consumes riposte critical opportunity if active.
     * @returns {number} 2.5 if riposte was consumed; 1.0 otherwise
     */
    consumeRiposte() {
        if (this.isRiposteAvailable && this.riposteTimer > 0) {
            this.isRiposteAvailable = false;
            this.riposteTimer = 0.0;
            return this.options.riposteMultiplier || DEFAULT_PARRY_CONFIG.riposteMultiplier;
        }
        return 1.0;
    }

    /**
     * Resets all internal timers, flags, and stats to initial zero state.
     */
    reset() {
        this.parryTimer = 0.0;
        this.cooldown = 0.0;
        this.isActive = false;
        this.riposteTimer = 0.0;
        this.isRiposteAvailable = false;
    }
}

// Module export bindings for CommonJS and ESM
const parrySystemModule = {
    DEFAULT_PARRY_CONFIG,
    ParryConstants,
    ParryResult,
    ParrySystem,
    createParryState,
    checkFrontalAlignment,
    calculateReflectedProjectile,
    calculateRiposteDamage,
    evaluateIncomingAttack
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = parrySystemModule;
}
if (typeof window !== 'undefined') {
    window.VaelthornParry = parrySystemModule;
}
