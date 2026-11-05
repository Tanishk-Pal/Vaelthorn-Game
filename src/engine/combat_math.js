/**
 * Vaelthorn: The Oath of Darkness — Combat Math Engine
 * File: src/engine/combat_math.js
 * 
 * Pure mathematical combat engine governing damage calculation, combo scaling,
 * defense mitigation, poise damage & stagger thresholds, Stygian Resonance accumulation
 * and decay, and parabolic projectile trajectory ballistics.
 */

/**
 * Default combat and balance tuning parameters.
 */
const DEFAULT_COMBAT_CONFIG = Object.freeze({
    comboDamages: Object.freeze([22, 28, 48]),
    heavyCleaveDamage: 70,
    stygianLanceDamage: 55,
    twinDaggersDamage: 18,
    riposteMultiplier: 2.5,
    shieldBreakMultiplier: 1.5,
    defenseSoftCap: 100,
    minDefense: -90,
    standardStaggerDuration: 1.2,
    parryStaggerDuration: 1.5,
    poiseRegenDelay: 3.0,
    defaultPoiseRegenRate: 20.0,
    defaultPlayerPoise: 100,
    defaultFootmanPoise: 40,
    defaultArcherPoise: 25,
    defaultBossPoise: 250,
    maxResonance: 100,
    resonanceLightHit: 15,
    resonanceFinisherHit: 25,
    resonanceParry: 100,
    resonanceDecayDelay: 4.0,
    resonanceDecayRate: 5.0,
    stygianLanceCost: 25,
    cinderNovaCost: 40,
    cinderNovaDamage: 40,
    defaultGravity: -26.0
});

/**
 * Constants dictionary matching engine loader and test assertions.
 */
const Constants = Object.freeze({
    COMBO_DAMAGES: Object.freeze([22, 28, 48]),
    RIPOSTE_MULTIPLIER: 2.5,
    SHIELD_BREAK_MULTIPLIER: 1.5,
    STYGIAN_LANCE_DAMAGE: 55,
    STYGIAN_LANCE_COST: 25,
    CINDER_NOVA_DAMAGE: 40,
    CINDER_NOVA_COST: 40,
    HEAVY_CLEAVE_DAMAGE: 70,
    DAGGER_DAMAGE: 18,
    LIGHT_HIT_RESONANCE: 15,
    PARRY_RESONANCE: 100,
    RESONANCE_DECAY_RATE: 5.0,
    RESONANCE_DECAY_DELAY: 4.0
});

// ============================================================================
// 1. DAMAGE & MITIGATION FORMULAS
// ============================================================================

/**
 * Returns the unmitigated base damage for a given light combo step (1, 2, or 3).
 * @param {number} step - Combo index (1, 2, or 3).
 * @param {readonly number[]} [damages] - Custom damage array.
 * @returns {number} Raw damage value.
 */
function getComboDamage(step, damages = DEFAULT_COMBAT_CONFIG.comboDamages) {
    if (!Number.isFinite(step) || step <= 1) return damages[0] || 22;
    if (step === 2) return damages[1] || 28;
    return damages[2] || 48;
}

/**
 * Calculates net damage taken after applying defense mitigation:
 * D_taken = max(1, round(D_raw / (1 + defense / 100))) for D_raw > 0.
 * If D_raw <= 0, returns 0.
 * Supports negative defense down to -90 (up to 10x damage amplification cap).
 * 
 * @param {number} rawDamage - Unmitigated incoming damage.
 * @param {number} [defense=0] - Target's defense rating (>= -90).
 * @param {Object} [config] - Tuning configuration.
 * @returns {number} Net damage taken (integer >= 1 for positive rawDamage).
 */
function calculateDamageMitigation(rawDamage, defense = 0, config = DEFAULT_COMBAT_CONFIG) {
    if (!Number.isFinite(rawDamage) || rawDamage <= 0) {
        return 0;
    }

    const cfg = config || DEFAULT_COMBAT_CONFIG;
    const safeDefense = Number.isFinite(defense) ? defense : 0;
    const minDef = Number.isFinite(cfg.minDefense) ? cfg.minDefense : DEFAULT_COMBAT_CONFIG.minDefense;
    const clampedDefense = Math.max(minDef, safeDefense);
    const softCap = (Number.isFinite(cfg.defenseSoftCap) && cfg.defenseSoftCap > 0)
        ? cfg.defenseSoftCap 
        : DEFAULT_COMBAT_CONFIG.defenseSoftCap;

    const denominator = Math.max(0.01, 1.0 + (clampedDefense / softCap));
    const mitigated = Math.round(rawDamage / denominator);
    return Math.max(1, mitigated);
}

/**
 * Standard damage calculation function matching engine loader and tier test suite.
 * Guards against negative defense by clamping defense to >= 0.
 * 
 * @param {number} rawDamage
 * @param {number} [defense=0]
 * @param {boolean} [isRiposte=false]
 * @param {boolean} [isHeavyShieldBreak=false]
 * @returns {number}
 */
function calculateDamage(rawDamage, defense = 0, isRiposte = false, isHeavyShieldBreak = false) {
    if (!Number.isFinite(rawDamage) || rawDamage <= 0) return 0;
    let multiplier = 1.0;
    if (isRiposte) multiplier = DEFAULT_COMBAT_CONFIG.riposteMultiplier;
    else if (isHeavyShieldBreak) multiplier = DEFAULT_COMBAT_CONFIG.shieldBreakMultiplier;

    const def = Math.max(0, Number.isFinite(defense) ? defense : 0);
    const mitigation = 100.0 / (100.0 + def);
    const net = rawDamage * multiplier * mitigation;
    return Math.max(1, Math.round(net));
}

/**
 * Calculates attack damage factoring in target stagger state (Critical Riposte).
 * @param {number} baseDamage - Base weapon damage.
 * @param {boolean} isTargetStaggered - True if target poise is broken.
 * @param {number} [multiplier=2.5] - Critical riposte multiplier.
 * @returns {{ damage: number, isCritical: boolean }}
 */
function calculateRiposteDamage(baseDamage, isTargetStaggered, multiplier = DEFAULT_COMBAT_CONFIG.riposteMultiplier) {
    if (!Number.isFinite(baseDamage) || baseDamage <= 0) {
        return { damage: 0, isCritical: false };
    }
    if (isTargetStaggered) {
        const mult = Number.isFinite(multiplier) && multiplier > 0 ? multiplier : DEFAULT_COMBAT_CONFIG.riposteMultiplier;
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
 * Master damage application function evaluating parry, invulnerability, shields,
 * riposte criticals, mitigation, and poise damage.
 * 
 * @param {Object} target - Target entity with hp, maxHp, defense, invulnerableTimer, poiseState.
 * @param {Object} damagePackage - Incoming attack parameters.
 * @param {Object} [config] - Balance configuration.
 * @returns {Object}
 */
function applyDamage(target, damagePackage, config = DEFAULT_COMBAT_CONFIG) {
    if (!target) {
        return {
            damageDealt: 0,
            rawDamage: 0,
            isCritical: false,
            isParried: false,
            isBlocked: false,
            isInvulnerable: false,
            newHp: 0,
            isDead: true,
            poiseBroken: false
        };
    }

    // 1. Check if already dead
    if (target.hp <= 0) {
        return {
            damageDealt: 0,
            rawDamage: damagePackage?.rawDamage || 0,
            isCritical: false,
            isParried: false,
            isBlocked: false,
            isInvulnerable: false,
            newHp: 0,
            isDead: true,
            poiseBroken: false
        };
    }

    // 2. Check Invulnerability (I-frames or active roll)
    if (target.invulnerableTimer > 0 || target.isInvulnerable || target.isRolling) {
        return {
            damageDealt: 0,
            rawDamage: damagePackage?.rawDamage || 0,
            isCritical: false,
            isParried: false,
            isBlocked: false,
            isInvulnerable: true,
            newHp: target.hp,
            isDead: false,
            poiseBroken: false
        };
    }

    // 3. Check Perfect Parry deflection
    if (damagePackage?.isParried) {
        return {
            damageDealt: 0,
            rawDamage: damagePackage?.rawDamage || 0,
            isCritical: false,
            isParried: true,
            isBlocked: false,
            isInvulnerable: false,
            newHp: target.hp,
            isDead: false,
            poiseBroken: false
        };
    }

    // 4. Check Frontal Shield Block (Light melee on Iron Phalanx)
    if (damagePackage?.isBlocked && !damagePackage?.isHeavy) {
        return {
            damageDealt: 0,
            rawDamage: damagePackage?.rawDamage || 0,
            isCritical: false,
            isParried: false,
            isBlocked: true,
            isInvulnerable: false,
            newHp: target.hp,
            isDead: false,
            poiseBroken: false
        };
    }

    // 5. Evaluate Stagger & Riposte Multiplier
    const cfg = config || DEFAULT_COMBAT_CONFIG;
    const isStaggered = Boolean(target.poiseState?.isStaggered);
    const rawDmg = Number.isFinite(damagePackage?.rawDamage) ? damagePackage.rawDamage : 0;
    const { damage: amplifiedDamage, isCritical } = calculateRiposteDamage(rawDmg, isStaggered, cfg.riposteMultiplier);

    // 6. Mitigate against Target Defense
    const targetDefense = Number.isFinite(target.defense) ? target.defense : 0;
    const finalDamage = calculateDamageMitigation(amplifiedDamage, targetDefense, cfg);

    // 7. Deduct Health & Clamp to 0
    target.hp = Math.max(0, target.hp - finalDamage);

    // 8. Grant brief post-damage I-frame grace window (0.3s)
    target.invulnerableTimer = 0.3;

    // 9. Apply Poise Damage
    let poiseBroken = false;
    if (target.poiseState && Number.isFinite(damagePackage?.poiseDamage) && damagePackage.poiseDamage > 0) {
        const poiseRes = applyPoiseDamage(target.poiseState, damagePackage.poiseDamage, cfg);
        poiseBroken = poiseRes.poiseBroken;
    }

    return {
        damageDealt: finalDamage,
        rawDamage: rawDmg,
        isCritical,
        isParried: false,
        isBlocked: false,
        isInvulnerable: false,
        newHp: target.hp,
        isDead: target.hp <= 0,
        poiseBroken
    };
}

// ============================================================================
// 2. POISE & STAGGER SYSTEM
// ============================================================================

/**
 * Creates an initialized PoiseState container.
 * @param {number} [maxPoise=100] - Maximum poise capacity.
 * @param {number} [regenRate=20] - Poise regeneration rate per second.
 * @param {number} [regenDelay=3.0] - Delay before poise regeneration starts.
 * @returns {Object}
 */
function createPoiseState(maxPoise = DEFAULT_COMBAT_CONFIG.defaultPlayerPoise, regenRate = DEFAULT_COMBAT_CONFIG.defaultPoiseRegenRate, regenDelay = DEFAULT_COMBAT_CONFIG.poiseRegenDelay) {
    const safeMax = Math.max(1, Number.isFinite(maxPoise) ? maxPoise : DEFAULT_COMBAT_CONFIG.defaultPlayerPoise);
    return {
        currentPoise: safeMax,
        maxPoise: safeMax,
        regenRate: Math.max(0, Number.isFinite(regenRate) ? regenRate : DEFAULT_COMBAT_CONFIG.defaultPoiseRegenRate),
        regenDelay: Math.max(0, Number.isFinite(regenDelay) ? regenDelay : DEFAULT_COMBAT_CONFIG.poiseRegenDelay),
        timeSincePoiseDamage: 0.0,
        isStaggered: false,
        staggerTimer: 0.0
    };
}

/**
 * Applies poise damage to an entity's poise state.
 * If poise drops to 0 or below, triggers the STAGGER state.
 * 
 * @param {Object} poiseState - Mutable poise state container.
 * @param {number} poiseDamage - Amount of poise damage to inflict.
 * @param {Object} [config] - Tuning configuration.
 * @returns {{ currentPoise: number, isStaggered: boolean, poiseBroken: boolean }}
 */
function applyPoiseDamage(poiseState, poiseDamage, config = DEFAULT_COMBAT_CONFIG) {
    if (!poiseState) return { currentPoise: 0, isStaggered: false, poiseBroken: false };

    const dmg = Number.isFinite(poiseDamage) ? Math.max(0, poiseDamage) : 0;
    poiseState.timeSincePoiseDamage = 0.0;

    // If already staggered, stay staggered; don't re-trigger initial break
    if (poiseState.isStaggered) {
        return {
            currentPoise: 0,
            isStaggered: true,
            poiseBroken: false
        };
    }

    poiseState.currentPoise = Math.max(0, poiseState.currentPoise - dmg);
    // Micro-poise epsilon threshold guarding against IEEE-754 precision drift
    if (poiseState.currentPoise <= 1e-5) {
        poiseState.currentPoise = 0;
    }

    let poiseBroken = false;
    if (poiseState.currentPoise <= 0) {
        poiseState.isStaggered = true;
        const cfg = config || DEFAULT_COMBAT_CONFIG;
        const staggerDur = Number.isFinite(cfg.standardStaggerDuration) 
            ? cfg.standardStaggerDuration 
            : DEFAULT_COMBAT_CONFIG.standardStaggerDuration;
        poiseState.staggerTimer = staggerDur;
        poiseState.currentPoise = 0;
        poiseBroken = true;
    }

    return {
        currentPoise: poiseState.currentPoise,
        isStaggered: poiseState.isStaggered,
        poiseBroken
    };
}

/**
 * Updates poise state over delta time: handles stagger countdown, recovery, and poise regen.
 * 
 * @param {Object} poiseState - Mutable poise state.
 * @param {number} dt - Timestep in seconds.
 * @returns {Object} Updated poise state.
 */
function updatePoise(poiseState, dt) {
    if (!poiseState || !Number.isFinite(dt) || dt <= 0) return poiseState;

    if (poiseState.isStaggered) {
        poiseState.staggerTimer -= dt;
        if (poiseState.staggerTimer <= 0) {
            // Recover from stagger: restore full poise
            poiseState.isStaggered = false;
            poiseState.staggerTimer = 0.0;
            poiseState.currentPoise = poiseState.maxPoise;
            poiseState.timeSincePoiseDamage = 0.0;
        }
    } else {
        poiseState.timeSincePoiseDamage += dt;
        if (poiseState.timeSincePoiseDamage >= poiseState.regenDelay) {
            const activeRegenDt = Math.min(dt, Math.max(0, poiseState.timeSincePoiseDamage - poiseState.regenDelay));
            if (activeRegenDt > 0) {
                poiseState.currentPoise = Math.min(
                    poiseState.maxPoise,
                    poiseState.currentPoise + poiseState.regenRate * activeRegenDt
                );
            }
        }
    }

    return poiseState;
}

/**
 * Poise calculation helper matching engine loader and test assertions.
 * 
 * @param {number} currentPoise
 * @param {number} poiseDamage
 * @returns {{ remainingPoise: number, isBroken: boolean }}
 */
function calculatePoise(currentPoise, poiseDamage) {
    const cur = Math.max(0, Number.isFinite(currentPoise) ? currentPoise : 0);
    const dmg = Math.max(0, Number.isFinite(poiseDamage) ? poiseDamage : 0);
    let rem = Math.max(0, cur - dmg);
    if (rem <= 1e-5) {
        rem = 0;
    }
    return {
        remainingPoise: rem,
        isBroken: rem <= 0
    };
}

// ============================================================================
// 3. STYGIAN RESONANCE SYSTEM
// ============================================================================

/**
 * Creates an initialized ResonanceState container.
 * @param {number} [initial=0] - Initial resonance value.
 * @param {number} [max=100] - Maximum capacity.
 * @returns {Object}
 */
function createResonanceState(initial = 0, max = DEFAULT_COMBAT_CONFIG.maxResonance) {
    const safeMax = Math.max(1, Number.isFinite(max) ? max : DEFAULT_COMBAT_CONFIG.maxResonance);
    const safeCur = Math.max(0, Math.min(safeMax, Number.isFinite(initial) ? initial : 0));
    return {
        current: safeCur,
        max: safeMax,
        idleTimer: 0.0,
        isOverdrive: safeCur >= safeMax
    };
}

/**
 * Adds resonance to the gauge, capping at maxResonance, and resets the idle timer.
 * @param {Object} resonanceState - Mutable resonance state.
 * @param {number} amount - Amount to add (+15 for hit, +100 for parry).
 * @param {Object} [config] - Balance configuration.
 * @returns {number} New resonance value.
 */
function addResonance(resonanceState, amount, config = DEFAULT_COMBAT_CONFIG) {
    if (!resonanceState) return 0;
    const gain = Number.isFinite(amount) ? Math.max(0, amount) : 0;
    const max = Number.isFinite(resonanceState.max) ? resonanceState.max : config.maxResonance;

    resonanceState.current = Math.min(max, resonanceState.current + gain);
    resonanceState.idleTimer = 0.0;
    resonanceState.isOverdrive = (resonanceState.current >= max);
    return resonanceState.current;
}

/**
 * Spends resonance to cast a spell if sufficient energy is available.
 * @param {Object} resonanceState - Mutable resonance state.
 * @param {number} [cost=25] - Energy cost (e.g., 25 for Stygian Lance).
 * @returns {boolean} True if spell cast succeeded and cost was deducted.
 */
function spendResonance(resonanceState, cost = DEFAULT_COMBAT_CONFIG.stygianLanceCost) {
    if (!resonanceState) return false;
    const safeCost = Number.isFinite(cost) ? Math.max(0, cost) : DEFAULT_COMBAT_CONFIG.stygianLanceCost;

    if (resonanceState.current >= safeCost) {
        resonanceState.current -= safeCost;
        resonanceState.idleTimer = 0.0;
        resonanceState.isOverdrive = (resonanceState.current >= resonanceState.max);
        return true;
    }
    return false;
}

/**
 * Updates resonance over delta time, draining energy after out-of-combat idle delay.
 * @param {Object} resonanceState - Mutable resonance state.
 * @param {number} dt - Timestep in seconds.
 * @param {Object} [config] - Balance configuration.
 * @returns {Object}
 */
function updateResonance(resonanceState, dt, config = DEFAULT_COMBAT_CONFIG) {
    if (!resonanceState || !Number.isFinite(dt) || dt <= 0) return resonanceState;

    resonanceState.idleTimer += dt;
    const cfg = config || DEFAULT_COMBAT_CONFIG;
    const decayDelay = Number.isFinite(cfg.resonanceDecayDelay) ? cfg.resonanceDecayDelay : DEFAULT_COMBAT_CONFIG.resonanceDecayDelay;
    const decayRate = Number.isFinite(cfg.resonanceDecayRate) ? cfg.resonanceDecayRate : DEFAULT_COMBAT_CONFIG.resonanceDecayRate;

    if (resonanceState.idleTimer >= decayDelay && resonanceState.current > 0) {
        const activeDecayDt = Math.min(dt, Math.max(0, resonanceState.idleTimer - decayDelay));
        if (activeDecayDt > 0) {
            resonanceState.current = Math.max(0.0, resonanceState.current - decayRate * activeDecayDt);
            resonanceState.isOverdrive = (resonanceState.current >= resonanceState.max);
        }
    }

    return resonanceState;
}

/**
 * Resonance calculation helper matching engine loader and test assertions.
 * 
 * @param {number} currentResonance
 * @param {number} [delta=0]
 * @param {number} [idleTime=0]
 * @param {number} [dt=0]
 * @returns {{ resonance: number, isOverdrive: boolean }}
 */
function calculateResonance(currentResonance, delta = 0, idleTime = 0, dt = 0) {
    let res = Math.max(0, Math.min(100, Number.isFinite(currentResonance) ? currentResonance : 0));
    if (delta !== 0) {
        res = Math.max(0, Math.min(100, res + delta));
    } else if (idleTime >= DEFAULT_COMBAT_CONFIG.resonanceDecayDelay && dt > 0) {
        const decay = DEFAULT_COMBAT_CONFIG.resonanceDecayRate * dt;
        res = Math.max(0, res - decay);
    }
    return {
        resonance: res,
        isOverdrive: res >= 100
    };
}

// ============================================================================
// 4. PARABOLIC PROJECTILE TRAJECTORY MATHEMATICS
// ============================================================================

/**
 * Evaluates projectile position along a parabolic arc at time t >= 0:
 * x(t) = x0 + vx0 * t
 * y(t) = y0 + vy0 * t - 0.5 * |g| * t^2
 * z(t) = 0 (2.5D plane constraint)
 * 
 * @param {number} x0 - Initial horizontal position.
 * @param {number} y0 - Initial vertical elevation.
 * @param {number} vx0 - Initial horizontal velocity.
 * @param {number} vy0 - Initial vertical velocity.
 * @param {number} t - Elapsed time in seconds (>= 0).
 * @param {number} [gravity=-26.0] - Downward gravity acceleration.
 * @returns {{ x: number, y: number, z: 0 }}
 */
function getTrajectoryPosition(x0, y0, vx0, vy0, t, gravity = DEFAULT_COMBAT_CONFIG.defaultGravity) {
    const safeT = Math.max(0, Number.isFinite(t) ? t : 0);
    const absG = Math.abs(Number.isFinite(gravity) ? gravity : DEFAULT_COMBAT_CONFIG.defaultGravity);

    return {
        x: x0 + vx0 * safeT,
        y: y0 + vy0 * safeT - 0.5 * absG * safeT * safeT,
        z: 0
    };
}

/**
 * Evaluates projectile velocity vector along a parabolic arc at time t >= 0:
 * vx(t) = vx0
 * vy(t) = vy0 - |g| * t
 * vz(t) = 0
 * 
 * @param {number} vx0 - Initial horizontal velocity.
 * @param {number} vy0 - Initial vertical velocity.
 * @param {number} t - Elapsed time in seconds (>= 0).
 * @param {number} [gravity=-26.0] - Downward gravity acceleration.
 * @returns {{ vx: number, vy: number, vz: 0 }}
 */
function getTrajectoryVelocity(vx0, vy0, t, gravity = DEFAULT_COMBAT_CONFIG.defaultGravity) {
    const safeT = Math.max(0, Number.isFinite(t) ? t : 0);
    const absG = Math.abs(Number.isFinite(gravity) ? gravity : DEFAULT_COMBAT_CONFIG.defaultGravity);

    return {
        vx: vx0,
        vy: vy0 - absG * safeT,
        vz: 0
    };
}

/**
 * Calculates the instantaneous flight tangent angle (pitch) in radians.
 * theta(t) = atan2(vy(t), vx(t)).
 * 
 * @param {number} vx0 - Initial horizontal velocity.
 * @param {number} vy0 - Initial vertical velocity.
 * @param {number} t - Elapsed time in seconds.
 * @param {number} [gravity=-26.0] - Downward gravity acceleration.
 * @returns {number} Angle in radians in [-PI, PI].
 */
function getTrajectoryAngle(vx0, vy0, t, gravity = DEFAULT_COMBAT_CONFIG.defaultGravity) {
    const vel = getTrajectoryVelocity(vx0, vy0, t, gravity);
    return Math.atan2(vel.vy, vel.vx);
}

/**
 * Calculates the apex (peak) of the parabolic arc.
 * t_apex = vy0 / |g| for vy0 > 0.
 * y_apex = y0 + vy0^2 / (2 * |g|).
 * 
 * @param {number} x0 - Initial horizontal position.
 * @param {number} y0 - Initial vertical elevation.
 * @param {number} vx0 - Initial horizontal velocity.
 * @param {number} vy0 - Initial vertical velocity.
 * @param {number} [gravity=-26.0] - Downward gravity acceleration.
 * @returns {{ timeToApex: number, apexX: number, apexY: number }}
 */
function calculateTrajectoryApex(x0, y0, vx0, vy0, gravity = DEFAULT_COMBAT_CONFIG.defaultGravity) {
    const absG = Math.abs(Number.isFinite(gravity) ? gravity : DEFAULT_COMBAT_CONFIG.defaultGravity);
    if (vy0 <= 0 || absG <= 0) {
        return { timeToApex: 0, apexX: x0, apexY: y0 };
    }

    const tApex = vy0 / absG;
    const apexX = x0 + vx0 * tApex;
    const apexY = y0 + (vy0 * vy0) / (2.0 * absG);
    return { timeToApex: tApex, apexX, apexY };
}

/**
 * Calculates the forward time-of-flight until the projectile descends to target elevation yTarget.
 * Solves y0 + vy0 * t - 0.5 * |g| * t^2 = yTarget.
 * 
 * @param {number} y0 - Initial launch elevation.
 * @param {number} vy0 - Initial vertical velocity.
 * @param {number} [yTarget=0] - Target impact elevation (e.g., ground level = 0).
 * @param {number} [gravity=-26.0] - Downward gravity acceleration.
 * @returns {number} Positive time to impact in seconds, or -1 if elevation is unreachable.
 */
function calculateFlightTime(y0, vy0, yTarget = 0, gravity = DEFAULT_COMBAT_CONFIG.defaultGravity) {
    const absG = Math.abs(Number.isFinite(gravity) ? gravity : DEFAULT_COMBAT_CONFIG.defaultGravity);
    if (absG <= 0) return -1;

    // Discriminant: vy0^2 + 2 * |g| * (y0 - yTarget)
    const discriminant = (vy0 * vy0) + 2.0 * absG * (y0 - yTarget);
    if (discriminant < 0) {
        // Target elevation is higher than apex: never reached
        return -1;
    }

    const tImpact = (vy0 + Math.sqrt(discriminant)) / absG;
    return Math.max(0, tImpact);
}

/**
 * Mode A Ballistic Solver: Computes initial launch velocity (vx0, vy0) to strike a target
 * at (targetX, targetY) given a designated time-of-flight T > 0.
 * 
 * vx0 = (targetX - x0) / T
 * vy0 = (targetY - y0 + 0.5 * |g| * T^2) / T
 * 
 * @param {number} x0 - Launch origin X.
 * @param {number} y0 - Launch origin Y.
 * @param {number} targetX - Target destination X.
 * @param {number} targetY - Target destination Y.
 * @param {number} timeOfFlight - Desired flight duration in seconds (T > 0).
 * @param {number} [gravity=-26.0] - Downward gravity acceleration.
 * @returns {Object | null} Velocity vector or null if invalid inputs.
 */
function solveLaunchVelocityForTime(x0, y0, targetX, targetY, timeOfFlight, gravity = DEFAULT_COMBAT_CONFIG.defaultGravity) {
    if (!Number.isFinite(timeOfFlight) || timeOfFlight <= 0) {
        return null;
    }
    const absG = Math.abs(Number.isFinite(gravity) ? gravity : DEFAULT_COMBAT_CONFIG.defaultGravity);

    const vx0 = (targetX - x0) / timeOfFlight;
    const vy0 = (targetY - y0 + 0.5 * absG * timeOfFlight * timeOfFlight) / timeOfFlight;
    const launchAngle = Math.atan2(vy0, vx0);

    return {
        vx: vx0,
        vy: vy0,
        vz: 0,
        timeOfFlight,
        launchAngle
    };
}

/**
 * Mode B Ballistic Solver: Computes initial launch velocity (vx0, vy0) for a fixed launch speed v0.
 * Solves the classical ballistic equation for launch angle theta:
 * tan(theta) = (v0^2 +/- sqrt(v0^4 - g * (g * dx^2 + 2 * dy * v0^2))) / (g * |dx|).
 * 
 * @param {number} x0 - Launch origin X.
 * @param {number} y0 - Launch origin Y.
 * @param {number} targetX - Target destination X.
 * @param {number} targetY - Target destination Y.
 * @param {number} launchSpeed - Fixed speed magnitude v0 > 0.
 * @param {boolean} [preferHighArc=false] - True to lob high over obstacles; false for direct flat arc.
 * @param {number} [gravity=-26.0] - Downward gravity acceleration.
 * @returns {Object | null} Velocity vector or null if target is out of range.
 */
function solveLaunchVelocityForSpeed(x0, y0, targetX, targetY, launchSpeed, preferHighArc = false, gravity = DEFAULT_COMBAT_CONFIG.defaultGravity) {
    if (!Number.isFinite(launchSpeed) || launchSpeed <= 0) {
        return null;
    }
    const absG = Math.abs(Number.isFinite(gravity) ? gravity : DEFAULT_COMBAT_CONFIG.defaultGravity);
    const dx = targetX - x0;
    const dy = targetY - y0;
    const absDx = Math.abs(dx);

    // Target directly above/below launch point (vertical fire)
    if (absDx < 1e-4) {
        if (dy > 0) {
            const maxH = (launchSpeed * launchSpeed) / (2.0 * absG);
            if (dy > maxH) return null; // out of range
            return {
                vx: 0,
                vy: launchSpeed,
                vz: 0,
                timeOfFlight: calculateFlightTime(y0, launchSpeed, targetY, gravity),
                launchAngle: Math.PI / 2
            };
        } else {
            return {
                vx: 0,
                vy: -launchSpeed,
                vz: 0,
                timeOfFlight: calculateFlightTime(y0, -launchSpeed, targetY, gravity),
                launchAngle: -Math.PI / 2
            };
        }
    }

    const v2 = launchSpeed * launchSpeed;
    const v4 = v2 * v2;
    // Ballistic Discriminant: v0^4 - g * (g * dx^2 + 2 * dy * v0^2)
    const discriminant = v4 - absG * (absG * absDx * absDx + 2.0 * dy * v2);

    if (discriminant < 0) {
        // Target is beyond maximum ballistic reach at launchSpeed
        return null;
    }

    const sqrtD = Math.sqrt(discriminant);
    const tanTheta = preferHighArc 
        ? (v2 + sqrtD) / (absG * absDx) 
        : (v2 - sqrtD) / (absG * absDx);

    const theta = Math.atan(tanTheta);
    const dirX = dx >= 0 ? 1 : -1;
    const vx0 = dirX * launchSpeed * Math.cos(theta);
    const vy0 = launchSpeed * Math.sin(theta);
    const timeOfFlight = absDx / Math.abs(vx0);

    return {
        vx: vx0,
        vy: vy0,
        vz: 0,
        timeOfFlight,
        launchAngle: Math.atan2(vy0, vx0)
    };
}

/**
 * Samples discrete coordinates along a parabolic trajectory for predictive visualization
 * or swept continuous raycasting.
 * 
 * @param {number} x0 - Launch origin X.
 * @param {number} y0 - Launch origin Y.
 * @param {number} vx0 - Initial horizontal velocity.
 * @param {number} vy0 - Initial vertical velocity.
 * @param {number} maxTime - End time of trajectory in seconds.
 * @param {number} [numSegments=20] - Number of segments to divide trajectory into.
 * @param {number} [gravity=-26.0] - Downward gravity acceleration.
 * @returns {Array<{ x: number, y: number, z: 0, t: number }>}
 */
function sampleTrajectoryPoints(x0, y0, vx0, vy0, maxTime, numSegments = 20, gravity = DEFAULT_COMBAT_CONFIG.defaultGravity) {
    const points = [];
    const safeMaxT = Math.max(0, Number.isFinite(maxTime) ? maxTime : 0);
    const segments = Math.max(1, Math.min(100, numSegments));

    for (let i = 0; i <= segments; i++) {
        const t = (i / segments) * safeMaxT;
        const pos = getTrajectoryPosition(x0, y0, vx0, vy0, t, gravity);
        points.push({
            x: pos.x,
            y: pos.y,
            z: 0,
            t
        });
    }

    return points;
}

/**
 * Trajectory calculation helper matching engine loader and test assertions.
 * 
 * @param {{ x: number, y: number }} origin
 * @param {{ x: number, y: number }} velocity
 * @param {number} [gravity=-26.0]
 * @param {number} [time=0]
 * @returns {{ x: number, y: number, z: 0.0 }}
 */
function calculateTrajectory(origin, velocity, gravity = DEFAULT_COMBAT_CONFIG.defaultGravity, time = 0) {
    const x0 = (origin && Number.isFinite(origin.x)) ? origin.x : 0.0;
    const y0 = (origin && Number.isFinite(origin.y)) ? origin.y : 0.0;
    const vx0 = (velocity && Number.isFinite(velocity.x)) ? velocity.x : 0.0;
    const vy0 = (velocity && Number.isFinite(velocity.y)) ? velocity.y : 0.0;
    const pos = getTrajectoryPosition(x0, y0, vx0, vy0, time, gravity);
    return {
        x: pos.x,
        y: pos.y,
        z: 0.0
    };
}

// Module export bindings for CommonJS and ESM
const combatMathModule = {
    DEFAULT_COMBAT_CONFIG,
    Constants,
    getComboDamage,
    calculateDamageMitigation,
    calculateDamage,
    calculateRiposteDamage,
    applyDamage,
    createPoiseState,
    applyPoiseDamage,
    updatePoise,
    calculatePoise,
    createResonanceState,
    addResonance,
    spendResonance,
    updateResonance,
    calculateResonance,
    getTrajectoryPosition,
    getTrajectoryVelocity,
    getTrajectoryAngle,
    calculateTrajectoryApex,
    calculateFlightTime,
    solveLaunchVelocityForTime,
    solveLaunchVelocityForSpeed,
    sampleTrajectoryPoints,
    calculateTrajectory
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = combatMathModule;
}
if (typeof window !== 'undefined') {
    window.VaelthornCombatMath = combatMathModule;
}
