/**
 * Unit Test Suite: Parry & Deflection System
 * File: tests/unit/parry_system.test.js
 * 
 * Verifies 6-frame (0.10s) precision deflection window, continuous delta-time integration,
 * directional alignment, anti-spam cooldown, unblockable attacks, projectile reflection,
 * poise breaks, and the 2.5x critical riposte multiplier.
 */

const { describe, test, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const ParryModule = require('../../src/engine/parry_system.js');

const {
    DEFAULT_PARRY_CONFIG,
    ParryConstants,
    ParryResult,
    ParrySystem,
    createParryState,
    checkFrontalAlignment,
    calculateReflectedProjectile,
    calculateRiposteDamage,
    evaluateIncomingAttack
} = ParryModule;

describe('Parry & Deflection System Unit Test Suite', () => {

    // ========================================================================
    // 1. PRECISION TIMING WINDOW (6 FRAMES / 0.10s)
    // ========================================================================
    describe('1. Precision Timing Window (6 frames at 60Hz = 0.10s)', () => {
        let parry;

        beforeEach(() => {
            parry = new ParrySystem(0.10);
        });

        test('initializes with inactive state, zero timers, and ready guard', () => {
            assert.equal(parry.isActive, false);
            assert.equal(parry.parryTimer, 0.0);
            assert.equal(parry.cooldown, 0.0);
            assert.equal(parry.canGuard(), true);
            assert.equal(parry.getRemainingTime(), 0.0);
            assert.equal(parry.getRemainingFramesAt60Hz(), 0);
        });

        test('triggerGuard() initiates 0.10s window and sets isActive to true', () => {
            const success = parry.triggerGuard();
            assert.equal(success, true);
            assert.equal(parry.isActive, true);
            assert.equal(parry.parryTimer, 0.10);
            assert.equal(parry.getRemainingFramesAt60Hz(), 6);
        });

        test('window timer decays accurately over continuous elapsed delta-time', () => {
            parry.triggerGuard();
            parry.update(0.04);
            assert.equal(parry.isActive, true);
            assert.ok(Math.abs(parry.parryTimer - 0.06) < 1e-4);
            assert.equal(parry.getRemainingFramesAt60Hz(), 4);
        });

        test('window remains active at boundary t = 0.099s', () => {
            parry.triggerGuard();
            parry.update(0.099);
            assert.equal(parry.isActive, true);
            assert.ok(parry.parryTimer > 0);

            const result = parry.evaluateIncomingHit({ damage: 30 });
            assert.equal(result.result, ParryResult.PARRIED);
            assert.equal(result.damageTaken, 0);
        });

        test('window expires exactly at boundary t = 0.100s', () => {
            parry.triggerGuard();
            parry.update(0.100);
            assert.equal(parry.isActive, false);
            assert.equal(parry.parryTimer, 0.0);

            const result = parry.evaluateIncomingHit({ damage: 30 });
            assert.equal(result.result, ParryResult.HIT);
            assert.equal(result.damageTaken, 30);
        });

        test('discrete 6-frame simulation at 60Hz (dt = 1/60s)', () => {
            const dt60 = 1.0 / 60.0;
            parry.triggerGuard();

            // Frames 1 through 5: must remain active
            for (let f = 1; f <= 5; f++) {
                parry.update(dt60);
                assert.equal(parry.isActive, true, `Frame ${f} must be active`);
            }

            // Frame 6: final frame closes window
            parry.update(dt60);
            assert.equal(parry.isActive, false, 'Frame 6 must close window');
        });
    });

    // ========================================================================
    // 2. SUB-FRAME INTEGRATION & VARIABLE TIMESTEP INVARIANCE
    // ========================================================================
    describe('2. Sub-frame Integration & Framerate Invariance', () => {
        test('functions identically across 30Hz, 60Hz, and 120Hz display refresh rates', () => {
            const parry30 = new ParrySystem(0.10);
            const parry60 = new ParrySystem(0.10);
            const parry120 = new ParrySystem(0.10);

            parry30.triggerGuard();
            parry60.triggerGuard();
            parry120.triggerGuard();

            // Simulate 0.0667s (2 frames at 30Hz, 4 frames at 60Hz, 8 frames at 120Hz)
            for (let i = 0; i < 2; i++) parry30.update(1 / 30);
            for (let i = 0; i < 4; i++) parry60.update(1 / 60);
            for (let i = 0; i < 8; i++) parry120.update(1 / 120);

            // All should have approximately 0.0333s remaining
            assert.ok(Math.abs(parry30.parryTimer - parry60.parryTimer) < 1e-3);
            assert.ok(Math.abs(parry60.parryTimer - parry120.parryTimer) < 1e-3);
        });

        test('sudden lag spike / frame drop (dt = 0.15s) closes window without underflow', () => {
            const parry = new ParrySystem(0.10);
            parry.triggerGuard();
            parry.update(0.15); // Large single frame drop

            assert.equal(parry.isActive, false);
            assert.equal(parry.parryTimer, 0.0);
            assert.ok(parry.cooldown >= 0.0, 'Cooldown must not be negative');
        });

        test('defensive guards against NaN, Infinity, and negative delta-times', () => {
            const parry = new ParrySystem(0.10);
            parry.triggerGuard();

            parry.update(NaN);
            assert.equal(parry.parryTimer, 0.10, 'NaN must not alter timer');

            parry.update(-0.05);
            assert.equal(parry.parryTimer, 0.10, 'Negative dt must not advance timer');

            parry.update(Infinity);
            assert.equal(parry.parryTimer, 0.10, 'Infinity must be ignored');
        });
    });

    // ========================================================================
    // 3. ANTI-SPAM GUARD COOLDOWN
    // ========================================================================
    describe('3. Anti-Spam Guard Cooldown (0.20s lockout)', () => {
        let parry;

        beforeEach(() => {
            parry = new ParrySystem(0.10, 0.20);
        });

        test('initiating guard sets cooldown to 0.20s', () => {
            parry.triggerGuard();
            assert.equal(parry.cooldown, 0.20);
            assert.equal(parry.canGuard(), false);
        });

        test('spamming guard during active cooldown is strictly rejected', () => {
            assert.equal(parry.triggerGuard(), true);
            // Immediate re-press
            assert.equal(parry.triggerGuard(), false);

            parry.update(0.05);
            assert.equal(parry.triggerGuard(), false);

            parry.update(0.10); // Window ended at 0.10s, but cooldown still has 0.05s
            assert.equal(parry.canGuard(), false);
            assert.equal(parry.triggerGuard(), false);
        });

        test('whiff recovery leaves player completely vulnerable between 0.10s and 0.20s', () => {
            parry.triggerGuard();
            parry.update(0.12); // Window expired, but cooldown active

            assert.equal(parry.isActive, false);
            assert.ok(parry.cooldown > 0);

            // Incoming strike during whiff recovery deals full damage
            const hit = parry.evaluateIncomingHit({ damage: 45 });
            assert.equal(hit.result, ParryResult.HIT);
            assert.equal(hit.damageTaken, 45);
            assert.equal(hit.resonanceGain, 0);
        });

        test('guard becomes ready again once full cooldown expires (0.20s)', () => {
            parry.triggerGuard();
            parry.update(0.20);

            assert.equal(parry.cooldown, 0.0);
            assert.equal(parry.canGuard(), true);
            assert.equal(parry.triggerGuard(), true, 'Guard must be re-triggerable');
        });
    });

    // ========================================================================
    // 4. DEFLECTION EVALUATION & COMBAT OUTCOMES
    // ========================================================================
    describe('4. Deflection Evaluation & Combat Outcomes', () => {
        let parry;

        beforeEach(() => {
            parry = new ParrySystem(0.10);
        });

        test('successful parry awards 0 damage, 100 poise damage, 100 resonance, and 0.08s hit-stop', () => {
            parry.triggerGuard();
            const result = parry.evaluateIncomingHit({ damage: 35 });

            assert.equal(result.result, ParryResult.PARRIED);
            assert.equal(result.damageTaken, 0, 'Must negate 100% of damage');
            assert.equal(result.enemyPoiseDamage, 100, 'Must inflict 100 poise damage');
            assert.equal(result.resonanceGain, 100, 'Must award 100 resonance (Overdrive)');
            assert.equal(result.hitStop, 0.08, 'Must trigger 0.08s hit-stop');
            assert.equal(result.sparks, true, 'Sparks FX must be flagged');
            assert.equal(result.isRiposteAvailable, true);
        });

        test('mistimed parry (> 0.10s) deals full damage and 0 resonance', () => {
            parry.triggerGuard();
            parry.update(0.11); // Window closed

            const result = parry.evaluateIncomingHit({ damage: 35 });
            assert.equal(result.result, ParryResult.HIT);
            assert.equal(result.damageTaken, 35);
            assert.equal(result.enemyPoiseDamage, 0);
            assert.equal(result.resonanceGain, 0);
            assert.equal(result.hitStop, 0.04);
            assert.equal(result.sparks, false);
        });

        test('evaluating hit when guard was never pressed deals full damage', () => {
            const result = parry.evaluateIncomingHit({ damage: 25 });
            assert.equal(result.result, ParryResult.HIT);
            assert.equal(result.damageTaken, 25);
            assert.equal(result.enemyPoiseDamage, 0);
            assert.equal(result.resonanceGain, 0);
        });

        test('successful parry resets cooldown to allow chain deflections against flurries', () => {
            parry.triggerGuard();
            assert.ok(parry.cooldown > 0);

            // Successfully deflect Hit 1 of flurry
            const res1 = parry.evaluateIncomingHit({ damage: 20 });
            assert.equal(res1.result, ParryResult.PARRIED);

            // Cooldown is cleared on success
            assert.equal(parry.cooldown, 0.0);
            assert.equal(parry.canGuard(), true);

            // Defender can immediately re-guard against Hit 2
            assert.equal(parry.triggerGuard(), true);
        });
    });

    // ========================================================================
    // 5. DIRECTIONAL 2.5D ALIGNMENT (FRONTAL VS BACK ATTACK)
    // ========================================================================
    describe('5. Directional 2.5D Alignment (Frontal vs Back Attack)', () => {
        let parry;

        beforeEach(() => {
            parry = new ParrySystem(0.10);
        });

        test('frontal attack from right when facing right (+1) is successfully parried', () => {
            parry.triggerGuard();
            const incoming = {
                damage: 30,
                attackerPos: { x: 5.0, y: 0 },
                defenderPos: { x: 3.0, y: 0 },
                defenderFacing: 1 // Facing right towards attacker
            };

            const result = parry.evaluateIncomingHit(incoming);
            assert.equal(result.result, ParryResult.PARRIED);
            assert.equal(result.damageTaken, 0);
        });

        test('frontal attack from left when facing left (-1) is successfully parried', () => {
            parry.triggerGuard();
            const incoming = {
                damage: 30,
                attackerPos: { x: 1.0, y: 0 },
                defenderPos: { x: 3.0, y: 0 },
                defenderFacing: -1 // Facing left towards attacker
            };

            const result = parry.evaluateIncomingHit(incoming);
            assert.equal(result.result, ParryResult.PARRIED);
            assert.equal(result.damageTaken, 0);
        });

        test('back attack strikes defender facing away, bypassing parry', () => {
            parry.triggerGuard();
            const incoming = {
                damage: 40,
                attackerPos: { x: 1.0, y: 0 },  // Attacker is to the left
                defenderPos: { x: 3.0, y: 0 },
                defenderFacing: 1               // Defender is facing right (away from attacker!)
            };

            const result = parry.evaluateIncomingHit(incoming);
            assert.equal(result.result, ParryResult.HIT);
            assert.equal(result.damageTaken, 40);
            assert.equal(result.reason, 'BACK_ATTACK');
        });

        test('coincident position (dx = 0) resolves safely as frontal', () => {
            assert.equal(checkFrontalAlignment({ x: 2.0, y: 0 }, { x: 2.0, y: 0 }, 1), true);
        });
    });

    // ========================================================================
    // 6. SPECIAL ATTACK TYPES (PROJECTILES & UNBLOCKABLES)
    // ========================================================================
    describe('6. Special Attack Types (Projectiles & Unblockables)', () => {
        let parry;

        beforeEach(() => {
            parry = new ParrySystem(0.10);
        });

        test('parrying projectile negates damage, grants resonance, and computes reverse ballistic velocity', () => {
            parry.triggerGuard();
            const projectileAttack = {
                damage: 25,
                isProjectile: true,
                projectile: { vx: -14.0, vy: 2.0 }
            };

            const result = parry.evaluateIncomingHit(projectileAttack);
            assert.equal(result.result, ParryResult.PARRIED);
            assert.equal(result.damageTaken, 0);
            assert.equal(result.resonanceGain, 100);
            assert.ok(result.reflectedProjectile !== null);
            // vx should be inverted and scaled by 1.25: -(-14.0) * 1.25 = +17.5
            assert.ok(Math.abs(result.reflectedProjectile.vx - 17.5) < 1e-4);
            assert.ok(result.reflectedProjectile.vy > 0);
        });

        test('unblockable perilous attack ignores parry window and deals full damage', () => {
            parry.triggerGuard();
            assert.equal(parry.isActive, true);

            const perilousAttack = {
                damage: 60,
                isUnblockable: true
            };

            const result = parry.evaluateIncomingHit(perilousAttack);
            assert.equal(result.result, ParryResult.UNBLOCKABLE_HIT);
            assert.equal(result.damageTaken, 60);
            assert.equal(result.enemyPoiseDamage, 0);
            assert.equal(result.resonanceGain, 0);
            assert.equal(result.sparks, false);
        });
    });

    // ========================================================================
    // 7. POISE BREAK STAGGER & RIPOSTE MULTIPLIER (2.5x)
    // ========================================================================
    describe('7. Poise Break Stagger & Riposte Multiplier', () => {
        test('calculateRiposteDamage applies 2.5x multiplier on staggered target', () => {
            const raw = 28;
            const standard = calculateRiposteDamage(raw, false);
            assert.equal(standard.damage, 28);
            assert.equal(standard.isCritical, false);

            const riposte = calculateRiposteDamage(raw, true);
            assert.equal(riposte.damage, Math.round(28 * 2.5)); // 70
            assert.equal(riposte.isCritical, true);
        });

        test('Overdrive + Riposte composite calculation yields 73 and 90 damage', () => {
            // Longsword Hit 1: base 22 -> Overdrive = round(22 * 1.3) = 29 -> Riposte = round(29 * 2.5) = 73
            const hit1Base = 22;
            const hit1Overdrive = Math.round(hit1Base * 1.3);
            const hit1Riposte = calculateRiposteDamage(hit1Overdrive, true);
            assert.equal(hit1Riposte.damage, 73);

            // Longsword Hit 2: base 28 -> Overdrive = round(28 * 1.3) = 36 -> Riposte = round(36 * 2.5) = 90
            const hit2Base = 28;
            const hit2Overdrive = Math.round(hit2Base * 1.3);
            const hit2Riposte = calculateRiposteDamage(hit2Overdrive, true);
            assert.equal(hit2Riposte.damage, 90);
        });

        test('consumeRiposte() returns 2.5 on first attack and resets to 1.0', () => {
            const parry = new ParrySystem(0.10);
            parry.triggerGuard();
            parry.evaluateIncomingHit({ damage: 20 });

            assert.equal(parry.isRiposteAvailable, true);
            const mult1 = parry.consumeRiposte();
            assert.equal(mult1, 2.5);

            // Second counter-attack does not get free riposte
            const mult2 = parry.consumeRiposte();
            assert.equal(mult2, 1.0);
        });

        test('riposte window expires when stagger timer decays to zero', () => {
            const parry = new ParrySystem(0.10);
            parry.triggerGuard();
            parry.evaluateIncomingHit({ damage: 20 });

            assert.equal(parry.isRiposteAvailable, true);
            // Default stagger window is 1.20s
            parry.update(1.21);

            assert.equal(parry.isRiposteAvailable, false);
            assert.equal(parry.consumeRiposte(), 1.0);
        });
    });

    // ========================================================================
    // 8. RESET & TELEMETRY
    // ========================================================================
    describe('8. Reset & Telemetry', () => {
        test('reset() clears all active timers and states', () => {
            const parry = new ParrySystem(0.10);
            parry.triggerGuard();
            parry.evaluateIncomingHit({ damage: 20 });

            assert.equal(parry.isActive, true);
            assert.equal(parry.isRiposteAvailable, true);

            parry.reset();

            assert.equal(parry.isActive, false);
            assert.equal(parry.parryTimer, 0.0);
            assert.equal(parry.cooldown, 0.0);
            assert.equal(parry.isRiposteAvailable, false);
            assert.equal(parry.riposteTimer, 0.0);
        });

        test('tracks telemetry counters for guards, parries, and misses', () => {
            const parry = new ParrySystem(0.10);
            parry.triggerGuard();
            parry.evaluateIncomingHit({ damage: 20 }); // Successful parry

            parry.triggerGuard();
            parry.update(0.12);
            parry.evaluateIncomingHit({ damage: 20 }); // Missed parry

            assert.equal(parry.stats.totalGuards, 2);
            assert.equal(parry.stats.successfulParries, 1);
            assert.equal(parry.stats.mistimedParries, 1);
        });
    });
});
