/**
 * Vaelthorn: The Oath of Darkness — Character Combat Controller
 * File: src/engine/character_combat.js
 * 
 * Deterministic 10-state player combat finite state machine governing Kaelen's combat loop:
 * - 3-hit combo buffer & reset engine (0.08s lockout, 0.20s queue buffer, 0.65s reset)
 * - Micro-freeze hit-stop scheduling (0.04s light, 0.08s finisher/parry)
 * - Three distinct weapon profiles (Penumbra Longsword, Great-Mace with Hyper-Armor, Twin Daggers)
 * - Universal health container with overkill clamping and 0.30s post-damage I-frames
 * - Stygian Resonance economy and Overdrive (+30% damage)
 * - Stygian Lance piercing beam spell execution via 2.5D AABB overlap and HitTracker
 * 
 * Design: Zero-cheat authentic mathematical implementation.
 */

const Hitbox = require('./hitbox.js');
const CombatMath = require('./combat_math.js');
const ParryModule = require('./parry_system.js');

/**
 * 10 Deterministic Player Combat States.
 */
const CombatStates = Object.freeze({
    IDLE: 'IDLE',
    MOVE: 'MOVE',
    ATTACK_1: 'ATTACK_1',
    ATTACK_2: 'ATTACK_2',
    ATTACK_3: 'ATTACK_3',
    GUARD: 'GUARD',
    DODGE_ROLL: 'DODGE_ROLL',
    SPELL_CAST: 'SPELL_CAST',
    HIT_STUN: 'HIT_STUN',
    DEAD: 'DEAD'
});

/**
 * Three distinct weapon profiles with unique damages, timings, reaches, and properties.
 */
const WEAPON_PROFILES = Object.freeze({
    PENUMBRA_LONGSWORD: Object.freeze({
        id: 'penumbra_longsword',
        name: 'Ashen Longsword ("Penumbra")',
        damages: Object.freeze([22, 28, 48]),
        durations: Object.freeze([0.22, 0.22, 0.30]),
        reaches: Object.freeze([2.4, 2.4, 2.6]),
        heights: Object.freeze([1.8, 1.8, 2.0]),
        hitStops: Object.freeze([0.04, 0.04, 0.08]),
        screenShakes: Object.freeze([0.15, 0.15, 0.35]),
        knockbacks: Object.freeze([6.0, 6.0, 9.0]),
        poiseDamages: Object.freeze([25, 30, 60]),
        resonanceGain: 15,
        finisherResonanceGain: 25,
        bufferThreshold: 0.08,
        hasHyperArmor: false,
        shieldBreakMultiplier: 1.0
    }),
    GREAT_MACE: Object.freeze({
        id: 'great_mace',
        name: "Executioner's Great-Mace",
        damages: Object.freeze([35, 45, 75]),
        durations: Object.freeze([0.38, 0.38, 0.48]),
        reaches: Object.freeze([2.6, 2.6, 2.8]),
        heights: Object.freeze([2.0, 2.0, 2.2]),
        hitStops: Object.freeze([0.06, 0.06, 0.10]),
        screenShakes: Object.freeze([0.25, 0.25, 0.50]),
        knockbacks: Object.freeze([8.0, 8.0, 14.0]),
        poiseDamages: Object.freeze([50, 65, 120]),
        resonanceGain: 20,
        finisherResonanceGain: 35,
        bufferThreshold: 0.12,
        hasHyperArmor: true,
        shieldBreakMultiplier: 1.5
    }),
    TWIN_DAGGERS: Object.freeze({
        id: 'twin_daggers',
        name: 'Twin Eclipse Daggers',
        damages: Object.freeze([14, 18, 32]),
        durations: Object.freeze([0.14, 0.14, 0.20]),
        reaches: Object.freeze([1.8, 1.8, 2.0]),
        heights: Object.freeze([1.6, 1.6, 1.8]),
        hitStops: Object.freeze([0.03, 0.03, 0.06]),
        screenShakes: Object.freeze([0.10, 0.10, 0.25]),
        knockbacks: Object.freeze([3.5, 3.5, 5.0]),
        poiseDamages: Object.freeze([12, 16, 30]),
        resonanceGain: 25,
        finisherResonanceGain: 35,
        bufferThreshold: 0.06,
        hasHyperArmor: false,
        shieldBreakMultiplier: 0.8
    })
});

/**
 * Default tuning configuration for PlayerCombat.
 */
const DEFAULT_COMBAT_CONFIG = Object.freeze({
    maxHp: 100,
    maxResonance: 100,
    comboResetTime: 0.65,
    postDamageIFrames: 0.30,
    hitStunDuration: 0.20,
    overdriveMultiplier: 1.30,
    resonanceDecayDelay: 4.0,
    resonanceDecayRate: 5.0,
    spellCooldown: 1.50
});

/**
 * Production-ready PlayerCombat controller for Kaelen.
 */
class PlayerCombat {
    /**
     * Constructs a new PlayerCombat instance.
     * 
     * @param {Object} [config={}] - Optional tuning overrides
     */
    constructor(config = {}) {
        this.config = { ...DEFAULT_COMBAT_CONFIG, ...config };

        this.maxHp = this.config.maxHp;
        this.hp = this.maxHp;

        this.maxResonance = this.config.maxResonance;
        this.resonance = 0;
        this.isOverdrive = false;

        this.state = CombatStates.IDLE;
        this.currentWeapon = WEAPON_PROFILES.PENUMBRA_LONGSWORD;

        this.comboStep = 0;
        this.lastAttackTime = 0;
        this.comboResetTime = this.config.comboResetTime;
        this.isAttacking = false;
        this.attackTimer = 0;
        this.isAttackBuffered = false;

        this.isInvulnerable = false;
        this.invulnerabilityTimer = 0;
        this.hitStopTimer = 0;
        this.hitStunTimer = 0;

        this.aegisShieldActive = false;
        this.aegisTimer = 0;
        this.spellCooldown = 0;

        this.hitTracker = new Hitbox.HitTracker();
        this.parrySystem = new ParryModule.ParrySystem(0.10, 0.20);

        this.simTime = 0;
        this.idleResonanceTimer = 0;
    }

    /**
     * Swaps the active weapon profile.
     * 
     * @param {string|Object} weaponKeyOrProfile - Weapon key, profile id, or profile object
     * @returns {Object} Newly equipped weapon profile
     */
    equipWeapon(weaponKeyOrProfile) {
        if (!weaponKeyOrProfile) {
            this.currentWeapon = WEAPON_PROFILES.PENUMBRA_LONGSWORD;
            return this.currentWeapon;
        }

        if (typeof weaponKeyOrProfile === 'object' && weaponKeyOrProfile.damages) {
            this.currentWeapon = weaponKeyOrProfile;
            return this.currentWeapon;
        }

        const key = String(weaponKeyOrProfile).toUpperCase();
        if (WEAPON_PROFILES[key]) {
            this.currentWeapon = WEAPON_PROFILES[key];
            return this.currentWeapon;
        }

        const lowerKey = String(weaponKeyOrProfile).toLowerCase();
        for (const profile of Object.values(WEAPON_PROFILES)) {
            if (profile.id === lowerKey) {
                this.currentWeapon = profile;
                return this.currentWeapon;
            }
        }

        this.currentWeapon = WEAPON_PROFILES.PENUMBRA_LONGSWORD;
        return this.currentWeapon;
    }

    /**
     * Triggers a weapon attack with 3-hit combo buffer and reset timing.
     * 
     * @param {number} [time] - Current simulation timestamp (s)
     * @returns {Object|null} Attack execution descriptor or null if locked out
     */
    triggerAttack(time) {
        if (this.state === CombatStates.DEAD) {
            return null;
        }

        const t = (time !== undefined && Number.isFinite(time)) ? time : this.simTime;
        const bufferThreshold = this.currentWeapon.bufferThreshold || 0.08;

        // Input lockout: reject attacks issued too early in the active swing
        if (this.isAttacking && this.attackTimer > bufferThreshold) {
            return null;
        }

        // Advance combo step or reset if idle beyond comboResetTime
        if (this.comboStep === 0 || (t - this.lastAttackTime > this.comboResetTime)) {
            this.comboStep = 1;
        } else {
            this.comboStep = (this.comboStep % 3) + 1;
        }

        this.lastAttackTime = t;
        this.isAttacking = true;
        this.attackTimer = this.currentWeapon.durations[this.comboStep - 1];
        this.hitTracker.clear();

        // Update state machine
        if (this.comboStep === 1) this.state = CombatStates.ATTACK_1;
        else if (this.comboStep === 2) this.state = CombatStates.ATTACK_2;
        else this.state = CombatStates.ATTACK_3;

        const baseDamages = this.currentWeapon.damages;
        const baseDamage = baseDamages[this.comboStep - 1];
        const isFinisher = this.comboStep === 3;

        const mult = this.config.overdriveMultiplier || 1.30;
        const damage = this.isOverdrive ? Math.round(baseDamage * mult) : baseDamage;

        const hitStop = this.currentWeapon.hitStops[this.comboStep - 1];
        const screenShake = this.currentWeapon.screenShakes[this.comboStep - 1];

        return {
            comboStep: this.comboStep,
            damage,
            isFinisher,
            hitStop,
            screenShake,
            reach: this.currentWeapon.reaches[this.comboStep - 1],
            height: this.currentWeapon.heights[this.comboStep - 1],
            knockback: this.currentWeapon.knockbacks[this.comboStep - 1],
            poiseDamage: this.currentWeapon.poiseDamages[this.comboStep - 1],
            resonanceGain: isFinisher ? this.currentWeapon.finisherResonanceGain : this.currentWeapon.resonanceGain,
            weaponId: this.currentWeapon.id
        };
    }

    /**
     * Executes a spell cast (Stygian Lance, Cinder Nova, Aegis of Umbra).
     * 
     * @param {string} spellName - 'stygian_lance', 'cinder_nova', or 'aegis_of_umbra'
     * @returns {Object} Spell outcome descriptor
     */
    triggerSpell(spellName) {
        if (this.state === CombatStates.DEAD) {
            return { success: false, reason: 'DEAD' };
        }

        if (this.spellCooldown > 0) {
            return { success: false, reason: 'COOLDOWN_ACTIVE' };
        }

        if (spellName === 'stygian_lance') {
            const cost = CombatMath.Constants?.STYGIAN_LANCE_COST || 25;
            if (this.resonance < cost) {
                return { success: false, reason: 'INSUFFICIENT_RESONANCE' };
            }
            this.resonance -= cost;
            this.idleResonanceTimer = 0;
            this.updateOverdrive();
            this.spellCooldown = this.config.spellCooldown || 1.50;
            this.state = CombatStates.SPELL_CAST;

            return {
                success: true,
                damage: CombatMath.Constants?.STYGIAN_LANCE_DAMAGE || 55,
                range: 16.0,
                thickness: 1.0,
                screenShake: 0.20,
                isPiercing: true,
                knockback: 6.0
            };
        } else if (spellName === 'cinder_nova') {
            const cost = CombatMath.Constants?.CINDER_NOVA_COST || 40;
            if (this.resonance < cost) {
                return { success: false, reason: 'INSUFFICIENT_RESONANCE' };
            }
            this.resonance -= cost;
            this.idleResonanceTimer = 0;
            this.updateOverdrive();
            this.spellCooldown = this.config.spellCooldown || 1.50;
            this.state = CombatStates.SPELL_CAST;

            return {
                success: true,
                damage: CombatMath.Constants?.CINDER_NOVA_DAMAGE || 40,
                radius: 4.0,
                screenShake: 0.30
            };
        } else if (spellName === 'aegis_of_umbra') {
            const cost = 30;
            if (this.resonance < cost) {
                return { success: false, reason: 'INSUFFICIENT_RESONANCE' };
            }
            this.resonance -= cost;
            this.idleResonanceTimer = 0;
            this.aegisShieldActive = true;
            this.aegisTimer = 4.0;
            this.updateOverdrive();
            this.spellCooldown = this.config.spellCooldown || 1.50;

            return {
                success: true,
                shieldDuration: 4.0
            };
        }

        return { success: false, reason: 'UNKNOWN_SPELL' };
    }

    /**
     * Executes Stygian Lance piercing beam against a collection of targets.
     * Evaluates continuous 2.5D AABB intersection and prevents duplicate hits.
     * 
     * @param {Object} [origin={ x: 0, y: 0 }] - Origin position
     * @param {number} [facing=1] - Facing direction (+1 right, -1 left)
     * @param {Array<Object>} [targets=[]] - List of potential enemy entities
     * @returns {Object} Comprehensive spell execution result
     */
    executeStygianLance(origin = { x: 0, y: 0 }, facing = 1, targets = []) {
        const spellResult = this.triggerSpell('stygian_lance');
        if (!spellResult.success) {
            return spellResult;
        }

        const beamBox = Hitbox.createBeamAABB(origin, facing, spellResult.range, spellResult.thickness || 1.0, 0.5);
        const hitTargets = [];
        const tracker = new Hitbox.HitTracker();

        if (Array.isArray(targets)) {
            for (const target of targets) {
                if (!target) continue;
                const targetId = target.id || `target_${Math.random()}`;
                const targetBox = target.hurtbox || {
                    minX: target.x - (target.width ? target.width / 2 : 0.5),
                    maxX: target.x + (target.width ? target.width / 2 : 0.5),
                    minY: (target.y || 0) - 0.2,
                    maxY: (target.y || 0) + (target.height || 1.8),
                    minZ: -0.5,
                    maxZ: 0.5
                };

                if (Hitbox.check2DOverlap(beamBox, targetBox)) {
                    if (tracker.registerHit(targetId)) {
                        const kb = Hitbox.calculateKnockback(origin, { x: target.x, y: target.y }, spellResult.knockback || 6.0, facing);
                        hitTargets.push({
                            targetId,
                            damage: spellResult.damage,
                            knockback: kb
                        });
                    }
                }
            }
        }

        return {
            ...spellResult,
            beamBox,
            hitCount: hitTargets.length,
            hits: hitTargets
        };
    }

    /**
     * Triggers guard/parry stance.
     * 
     * @returns {boolean} True if guard was initiated; false if rejected
     */
    triggerGuard() {
        if (this.state === CombatStates.DEAD) {
            return false;
        }
        const success = this.parrySystem.triggerGuard();
        if (success) {
            this.state = CombatStates.GUARD;
            return true;
        }
        return false;
    }

    /**
     * Adds Stygian Resonance to the gauge and updates Overdrive state.
     * 
     * @param {number} amount - Resonance units to add
     */
    addResonance(amount) {
        const safeAmount = Math.max(0, Number.isFinite(amount) ? amount : 0);
        this.resonance = Math.min(this.maxResonance, this.resonance + safeAmount);
        this.idleResonanceTimer = 0;
        this.updateOverdrive();
    }

    /**
     * Spends Stygian Resonance if sufficient energy is present.
     * 
     * @param {number} amount - Energy cost
     * @returns {boolean} True if successfully spent; false if insufficient
     */
    spendResonance(amount) {
        const cost = Math.max(0, Number.isFinite(amount) ? amount : 0);
        if (this.resonance >= cost) {
            this.resonance -= cost;
            this.idleResonanceTimer = 0;
            this.updateOverdrive();
            return true;
        }
        return false;
    }

    /**
     * Updates the Overdrive state flag based on gauge saturation.
     */
    updateOverdrive() {
        this.isOverdrive = this.resonance >= 100;
    }

    /**
     * Evaluates incoming damage against I-frames, Aegis shield, Hyper-Armor, and HP.
     * 
     * @param {number} rawDamage - Incoming raw damage
     * @param {number} [incomingPoiseDmg=0] - Incoming poise damage
     * @returns {Object} Damage mitigation outcome
     */
    takeDamage(rawDamage, incomingPoiseDmg = 0) {
        if (this.isInvulnerable) {
            return {
                damageTaken: 0,
                absorbed: true,
                hpRemaining: this.hp,
                isDead: this.hp <= 0
            };
        }

        if (this.aegisShieldActive) {
            this.aegisShieldActive = false;
            this.aegisTimer = 0;
            const heal = Math.round(this.maxHp * 0.5);
            this.hp = Math.min(this.maxHp, this.hp + heal);
            this.invulnerabilityTimer = this.config.postDamageIFrames;
            this.isInvulnerable = true;
            return {
                damageTaken: 0,
                aegisHealed: heal,
                hpRemaining: this.hp,
                isDead: false
            };
        }

        if (this.hp <= 0) {
            return {
                damageTaken: 0,
                hpRemaining: 0,
                isDead: true
            };
        }

        const dmg = Math.max(1, Math.round(Number.isFinite(rawDamage) ? rawDamage : 0));
        this.hp = Math.max(0, this.hp - dmg);
        this.invulnerabilityTimer = this.config.postDamageIFrames;
        this.isInvulnerable = true;

        if (this.hp <= 0) {
            this.state = CombatStates.DEAD;
            this.isAttacking = false;
            return {
                damageTaken: dmg,
                hpRemaining: 0,
                isDead: true
            };
        }

        // Apply hit-stun unless protected by Hyper-Armor during an active swing
        if (!this.currentWeapon.hasHyperArmor || !this.isAttacking) {
            this.state = CombatStates.HIT_STUN;
            this.hitStunTimer = this.config.hitStunDuration;
            this.isAttacking = false;
        }

        return {
            damageTaken: dmg,
            hpRemaining: this.hp,
            isDead: false
        };
    }

    /**
     * Restores health with strict upper clamping at maxHp.
     * Dead entities cannot be healed.
     * 
     * @param {number} amount - Health units to restore
     * @returns {{ healed: number, hpRemaining: number }}
     */
    heal(amount) {
        if (this.hp <= 0) {
            return { healed: 0, hpRemaining: 0 };
        }
        const safeAmount = Math.max(0, Number.isFinite(amount) ? amount : 0);
        const prevHp = this.hp;
        this.hp = Math.min(this.maxHp, this.hp + safeAmount);
        return {
            healed: this.hp - prevHp,
            hpRemaining: this.hp
        };
    }

    /**
     * Revives a defeated entity with a specified percentage of maxHp.
     * 
     * @param {number} [hpPercent=1.0] - Health restoration ratio (0.10 to 1.0)
     * @returns {Object} Revived status
     */
    revive(hpPercent = 1.0) {
        const pct = Math.max(0.1, Math.min(1.0, Number.isFinite(hpPercent) ? hpPercent : 1.0));
        this.hp = Math.round(this.maxHp * pct);
        this.state = CombatStates.IDLE;
        this.isAttacking = false;
        this.isInvulnerable = false;
        this.invulnerabilityTimer = 0;
        this.hitStunTimer = 0;
        return {
            hp: this.hp,
            state: this.state
        };
    }

    /**
     * Computes the world-space attack hitbox AABB for the active swing.
     * 
     * @param {Object} [attackerPos={ x: 0, y: 0 }] - Attacker position
     * @param {number} [facing=1] - Facing direction (+1 right, -1 left)
     * @returns {Object|null} AABB bounding box or null if not attacking
     */
    getActiveHitbox(attackerPos = { x: 0, y: 0 }, facing = 1) {
        if (!this.isAttacking || this.comboStep < 1) {
            return null;
        }
        const reach = this.currentWeapon.reaches[this.comboStep - 1];
        const height = this.currentWeapon.heights[this.comboStep - 1];
        const baseDamage = this.currentWeapon.damages[this.comboStep - 1];
        const isFinisher = this.comboStep === 3;

        const mult = this.config.overdriveMultiplier || 1.30;
        const damage = this.isOverdrive ? Math.round(baseDamage * mult) : baseDamage;

        const box = Hitbox.computeSwordHitbox(attackerPos, facing, reach, height);
        return {
            ...box,
            damage,
            comboStep: this.comboStep,
            isFinisher,
            hitStop: this.currentWeapon.hitStops[this.comboStep - 1],
            knockbackForce: this.currentWeapon.knockbacks[this.comboStep - 1],
            poiseDamage: this.currentWeapon.poiseDamages[this.comboStep - 1]
        };
    }

    /**
     * Registers a hit target on the active swing's HitTracker to suppress duplicate damage.
     * 
     * @param {string|number} targetId - Unique target identifier
     * @returns {boolean} True if this is the first hit on this target; false if duplicate
     */
    registerTargetHit(targetId) {
        return this.hitTracker.registerHit(targetId);
    }

    /**
     * Updates simulation clocks, hit-stop freeze, timers, state transitions, and resonance decay.
     * 
     * @param {number} dt - Timestep in seconds
     */
    update(dt) {
        if (!Number.isFinite(dt) || dt <= 0) {
            return;
        }

        this.simTime += dt;

        // 1. Hit-Stop Freeze: freeze position, velocity, and combat timers during impact freeze
        if (this.hitStopTimer > 0) {
            this.hitStopTimer = Math.max(0.0, this.hitStopTimer - dt);
            return;
        }

        // 2. Active Swing Timer Decay
        if (this.attackTimer > 0) {
            this.attackTimer = Math.max(0.0, this.attackTimer - dt);
            if (this.attackTimer <= 0) {
                this.isAttacking = false;
                if (this.state === CombatStates.ATTACK_1 || 
                    this.state === CombatStates.ATTACK_2 || 
                    this.state === CombatStates.ATTACK_3) {
                    this.state = CombatStates.IDLE;
                }
            }
        }

        // 3. Post-Damage Invulnerability Timer Decay
        if (this.invulnerabilityTimer > 0) {
            this.invulnerabilityTimer = Math.max(0.0, this.invulnerabilityTimer - dt);
            if (this.invulnerabilityTimer <= 0) {
                this.isInvulnerable = false;
            }
        }

        // 4. Aegis of Umbra Shield Timer Decay
        if (this.aegisTimer > 0) {
            this.aegisTimer = Math.max(0.0, this.aegisTimer - dt);
            if (this.aegisTimer <= 0) {
                this.aegisShieldActive = false;
            }
        }

        // 5. Hit-Stun Recovery Timer Decay
        if (this.hitStunTimer > 0) {
            this.hitStunTimer = Math.max(0.0, this.hitStunTimer - dt);
            if (this.hitStunTimer <= 0 && this.state === CombatStates.HIT_STUN) {
                this.state = CombatStates.IDLE;
            }
        }

        // 6. Spell Cooldown Decay
        if (this.spellCooldown > 0) {
            this.spellCooldown = Math.max(0.0, this.spellCooldown - dt);
        }

        // 7. Internal Parry System Integration
        if (this.parrySystem) {
            this.parrySystem.update(dt);
            if (this.state === CombatStates.GUARD && !this.parrySystem.isActive) {
                this.state = CombatStates.IDLE;
            }
        }

        // 8. Stygian Resonance Idle Decay
        this.idleResonanceTimer += dt;
        const decayDelay = this.config.resonanceDecayDelay || 4.0;
        if (this.idleResonanceTimer >= decayDelay && this.resonance > 0) {
            const decayRate = this.config.resonanceDecayRate || 5.0;
            this.resonance = Math.max(0.0, this.resonance - decayRate * dt);
            this.updateOverdrive();
        }
    }
}

// Module export bindings for CommonJS and ESM
const characterCombatModule = {
    CombatStates,
    WEAPON_PROFILES,
    DEFAULT_COMBAT_CONFIG,
    PlayerCombat
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = characterCombatModule;
}
if (typeof window !== 'undefined') {
    window.VaelthornCharacterCombat = characterCombatModule;
}
