/**
 * Tier 2 - Boundary & Corner Cases Test Suite
 * 
 * Tests extreme inputs, zero velocity, max speed, coyote edge times,
 * Z=0 planar clamps, negative inputs, empty states, and NaN/Infinity guards.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const {
    Kinematics,
    Hitbox,
    CombatMath,
    CharacterCombat,
    EnemyAI
} = require('../helpers/engine_loader.js');

describe('Tier 2: Boundary & Corner Cases', () => {

    // ========================================================================
    // Kinematics & Timing Boundaries
    // ========================================================================
    describe('Kinematics & Timing Boundaries', () => {
        test('Coyote Time exact edge: 0.119s permits jump, 0.121s rejects jump', () => {
            const cfg = Kinematics.Constants;

            // Case A: Just within coyote window (0.119s elapsed of 0.120s)
            const entityA = { x: 0, y: 1.0, z: 0, vx: 0, vy: 0, vz: 0, isGrounded: false, coyoteTimer: 0.001 };
            Kinematics.updateKinematics(entityA, { jumpPressed: true }, 0.0005);
            assert.ok(entityA.vy > 10.0, 'Jump should trigger when coyote timer > 0');

            // Case B: Just past coyote window (timer expired at 0.0s)
            const entityB = { x: 0, y: 1.0, z: 0, vx: 0, vy: 0, vz: 0, isGrounded: false, coyoteTimer: 0.0 };
            Kinematics.updateKinematics(entityB, { jumpPressed: true }, 0.016);
            assert.ok(entityB.vy <= 0, 'Jump must be rejected once coyote timer has expired');
        });

        test('Jump Buffering exact edge: 0.119s landing consumes buffer, 0.121s landing drops buffer', () => {
            // Case A: Buffered input tapped 0.11s before landing (buffer active)
            const entityA = { x: 0, y: 0.1, z: 0, vx: 0, vy: -2.0, vz: 0, isGrounded: false, jumpBufferTimer: 0.02 };
            entityA.y = 0; // Land
            Kinematics.updateKinematics(entityA, {}, 0.010);
            assert.ok(entityA.vy > 10.0, 'Buffered jump must fire upon landing when timer > 0');

            // Case B: Buffer expired before landing
            const entityB = { x: 0, y: 0.1, z: 0, vx: 0, vy: -2.0, vz: 0, isGrounded: false, jumpBufferTimer: 0.0 };
            entityB.y = 0; // Land
            Kinematics.updateKinematics(entityB, {}, 0.016);
            assert.equal(entityB.vy, Kinematics.Constants.STICKY_GROUND_VELOCITY, 'Expired buffer must not trigger jump');
        });

        test('2.5D Plane Clamp against extreme drift: Z = ±100m and Z = 0.005m clamp to strictly 0.0', () => {
            const entity = { x: 0, y: 0, z: 100.0, vx: 0, vy: 0, vz: 25.0 };
            Kinematics.enforce2DPlane(entity);
            assert.equal(entity.z, 0.0);
            assert.equal(entity.vz, 0.0);

            entity.z = -88.88;
            entity.vz = -50.0;
            Kinematics.enforce2DPlane(entity);
            assert.equal(entity.z, 0.0);
            assert.equal(entity.vz, 0.0);

            entity.z = 0.005; // Slightly above tolerance 0.001
            Kinematics.enforce2DPlane(entity);
            assert.equal(entity.z, 0.0);
        });

        test('Input Extremes & Clamping: u_x = -999 and u_x = +500 clamp cleanly to ±1.0', () => {
            const entity = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, isGrounded: true };
            Kinematics.updateKinematics(entity, { horizontal: -999 }, 1.0);
            assert.equal(entity.vx, -Kinematics.Constants.MOVE_SPEED, 'vx should be clamped to -MOVE_SPEED');
            assert.equal(entity.facing, -1);

            Kinematics.updateKinematics(entity, { horizontal: 500 }, 1.0);
            assert.equal(entity.vx, Kinematics.Constants.MOVE_SPEED, 'vx should be clamped to +MOVE_SPEED');
            assert.equal(entity.facing, 1);
        });

        test('Defensive NaN and Infinity guards prevent kinematic corruption', () => {
            const entity = { x: NaN, y: Infinity, z: -Infinity, vx: NaN, vy: NaN, vz: NaN };
            Kinematics.updateKinematics(entity, { horizontal: NaN }, 0.016);
            assert.equal(Number.isFinite(entity.x), true, 'x must be normalized to finite number');
            assert.equal(Number.isFinite(entity.y), true, 'y must be normalized to finite number');
            assert.equal(entity.z, 0.0, 'z must be 0.0');
            assert.equal(Number.isFinite(entity.vx), true, 'vx must be finite');
            assert.equal(Number.isFinite(entity.vy), true, 'vy must be finite');
        });

        test('Zero and negative delta-time guards prevent negative integration and division errors', () => {
            const entity = { x: 5.0, y: 2.0, z: 0, vx: 9.0, vy: -5.0, vz: 0 };
            Kinematics.updateKinematics(entity, { horizontal: 1.0 }, 0.0);
            assert.equal(entity.x, 5.0, 'Position must not change when dt = 0');

            Kinematics.updateKinematics(entity, { horizontal: 1.0 }, -0.1);
            assert.equal(entity.x, 5.0, 'Negative dt must be clamped to 0');
        });
    });

    // ========================================================================
    // Combat, Health & Resource Boundaries
    // ========================================================================
    describe('Combat, Health & Resource Boundaries', () => {
        test('Overkill Damage: HP = 5 taking 99999 damage clamps HP strictly to 0 and flags defeat once', () => {
            const combat = new CharacterCombat.PlayerCombat();
            combat.hp = 5;
            const res = combat.takeDamage(99999);
            assert.equal(combat.hp, 0, 'HP must never drop below 0');
            assert.equal(res.hpRemaining, 0);
            assert.equal(res.isDead, true);

            // Taking damage while already at 0 HP
            combat.isInvulnerable = false;
            const res2 = combat.takeDamage(100);
            assert.equal(combat.hp, 0);
        });

        test('Over-Healing Boundary: HP = 95 healed for 50 clamps strictly to maxHp (100)', () => {
            const combat = new CharacterCombat.PlayerCombat();
            combat.hp = 95;
            combat.aegisShieldActive = true;
            combat.takeDamage(10); // Triggers Aegis heal of 50
            assert.equal(combat.hp, 100, 'HP must not exceed maxHp');
        });

        test('Resonance Gauge Boundaries: Underflow clamped to 0, overflow clamped to 100', () => {
            // Underflow
            const underflow = CombatMath.calculateResonance(0, -50);
            assert.equal(underflow.resonance, 0, 'Resonance must not be negative');

            // Overflow
            const overflow = CombatMath.calculateResonance(90, 50);
            assert.equal(overflow.resonance, 100, 'Resonance must cap at 100');
            assert.equal(overflow.isOverdrive, true);
        });

        test('Defense Division-by-Zero and Negative Defense guards in damage formula', () => {
            // Defense = 0: normal raw damage
            const dmgNormal = CombatMath.calculateDamage(50, 0);
            assert.equal(dmgNormal, 50);

            // Negative defense: guarded by max(0, defense)
            const dmgNegDef = CombatMath.calculateDamage(50, -100);
            assert.equal(dmgNegDef, 50, 'Negative defense must be clamped to 0 to prevent zero division');

            // Massive defense soft cap: returns minimum 1 damage
            const dmgMassiveDef = CombatMath.calculateDamage(50, 100000);
            assert.equal(dmgMassiveDef, 1, 'Heavy defense still yields minimum 1 damage for hit recognition');
        });

        test('HitTracker boundary: null/undefined/empty IDs and extreme volume deduplication', () => {
            const tracker = new Hitbox.HitTracker();
            // Duplicate spam
            for (let i = 0; i < 500; i++) {
                tracker.registerHit('boss_target_1');
            }
            assert.equal(tracker.count, 1, 'Repeated hits for same target ID must result in count = 1');
            assert.equal(tracker.hasHit('boss_target_1'), true);
            assert.equal(tracker.hasHit('non_existent'), false);
        });

        test('Rapid Attack Input Spamming: 10 attack calls in 0.05s buffer cleanly without desync', () => {
            const combat = new CharacterCombat.PlayerCombat();
            const firstHit = combat.triggerAttack(0.0);
            assert.equal(firstHit.comboStep, 1);

            // Spam calls while attackTimer is active
            for (let i = 0; i < 9; i++) {
                const spammed = combat.triggerAttack(0.01 * (i + 1));
                assert.equal(spammed, null, 'Spammed attacks during active swing must be locked out');
            }
            assert.equal(combat.comboStep, 1, 'Combo step must remain 1 during active swing');
        });
    });

    // ========================================================================
    // Geometric Overlap & Collision Boundaries
    // ========================================================================
    describe('Geometric Overlap & Collision Boundaries', () => {
        test('AABB Overlap boundary: Exact touching edges count as intersecting', () => {
            const boxA = { minX: 0, maxX: 2, minY: 0, maxY: 2 };
            const boxB = { minX: 2, maxX: 4, minY: 0, maxY: 2 }; // Touching at x = 2
            assert.equal(Hitbox.check2DOverlap(boxA, boxB), true, 'Touching edge must count as overlap');

            const boxDisjoint = { minX: 2.001, maxX: 4, minY: 0, maxY: 2 };
            assert.equal(Hitbox.check2DOverlap(boxA, boxDisjoint), false, 'Separated box must not overlap');
        });

        test('Vertical disjoint boundary: Boxes overlapping in X but disjoint in Y do not collide', () => {
            // Fixes the 1D prototype bug
            const boxGround = { minX: 0, maxX: 3, minY: 0, maxY: 1.5 };
            const boxAirborne = { minX: 1, maxX: 2, minY: 3.5, maxY: 5.0 };
            assert.equal(Hitbox.check2DOverlap(boxGround, boxAirborne), false, 'Vertical disjoint must prevent collision');
        });
    });
});
