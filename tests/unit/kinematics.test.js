const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
    DEFAULT_KINEMATICS_CONFIG,
    Constants,
    createKinematicsEntity,
    createDefaultInput,
    calculateJumpVelocity,
    calculateGravityAcceleration,
    executeJump,
    executeRoll,
    clamp2DPlane,
    enforce2DPlane,
    resolveGroundCollision,
    updateKinematics
} = require('../../src/engine/kinematics.js');

describe('Kinematics Engine Unit Test Suite', () => {

    describe('Takeoff Velocity & Gravity Formulas', () => {
        it('calculates analytical jump takeoff velocity sqrt(2 * |g| * h) precisely', () => {
            const vy0 = calculateJumpVelocity(-26.0, 2.4);
            const expected = Math.sqrt(2.0 * 26.0 * 2.4); // sqrt(124.8) ~= 11.171392
            assert.ok(Math.abs(vy0 - expected) < 1e-6);
            assert.ok(Math.abs(vy0 - 11.171392) < 1e-4);

            // Also test reversed parameter order: (jumpHeight, gravity)
            const vy0Rev = calculateJumpVelocity(2.4, -26.0);
            assert.ok(Math.abs(vy0Rev - expected) < 1e-6);
        });

        it('evaluates piecewise gravity correctly across all 3 motion regimes', () => {
            const config = DEFAULT_KINEMATICS_CONFIG;
            
            // 1. Full ascent: vy > 0 and jumpHeld = true -> -26.0
            const aAscent = calculateGravityAcceleration(10.0, true, config);
            assert.equal(aAscent, -26.0);

            // 2. Short hop: vy > 0 and jumpHeld = false -> -26.0 * 2.2 = -57.2
            const aShortHop = calculateGravityAcceleration(10.0, false, config);
            assert.equal(aShortHop, -57.2);

            // 3. Snappy falling: vy < 0 -> -26.0 * 1.6 = -41.6
            const aFalling = calculateGravityAcceleration(-5.0, true, config);
            assert.equal(aFalling, -41.6);
            const aFallingRelease = calculateGravityAcceleration(-5.0, false, config);
            assert.equal(aFallingRelease, -41.6);
        });
    });

    describe('Horizontal Locomotion & Facing Direction', () => {
        it('applies horizontal velocity vx = ux * moveSpeed', () => {
            const entity = createKinematicsEntity();
            const input = createDefaultInput();
            input.horizontal = 1.0;
            const dt = 1.0 / 60.0;

            updateKinematics(entity, input, dt);
            assert.equal(entity.vx, 9.0);
            assert.ok(Math.abs(entity.x - 0.15) < 1e-4);
            assert.equal(entity.facing, 1);
        });

        it('flips facing direction only when input exceeds deadzone', () => {
            const entity = createKinematicsEntity({ facing: 1 });
            const input = createDefaultInput();
            const dt = 0.016;

            // Small input below deadzone (0.05 <= 0.10) does NOT flip facing
            input.horizontal = -0.05;
            updateKinematics(entity, input, dt);
            assert.equal(entity.facing, 1);

            // Input exceeding deadzone (-0.5 < -0.10) flips facing to -1
            input.horizontal = -0.5;
            updateKinematics(entity, input, dt);
            assert.equal(entity.facing, -1);
            assert.equal(entity.vx, -4.5);
        });
    });

    describe('Jump Execution, Coyote Time & Jump Buffering', () => {
        it('triggers full jump when grounded and jumpPressed is true', () => {
            const entity = createKinematicsEntity({ isGrounded: true, coyoteTimer: 0.12 });
            const input = createDefaultInput();
            input.jumpPressed = true;
            input.jumpHeld = true;

            updateKinematics(entity, input, 0.016);
            assert.ok(entity.vy > 10.0);
            assert.equal(entity.isGrounded, false);
            assert.equal(entity.coyoteTimer, 0.0);
            assert.equal(entity.jumpBufferTimer, 0.0);
        });

        it('executes jump mid-air within coyote time window (0.12s)', () => {
            const entity = createKinematicsEntity({
                isGrounded: false,
                coyoteTimer: 0.08, // Still within 0.12s grace window
                y: 5.0
            });
            const input = createDefaultInput();
            input.jumpPressed = true;
            input.jumpHeld = true;

            updateKinematics(entity, input, 0.016);
            assert.ok(entity.vy > 10.0);
            assert.equal(entity.coyoteTimer, 0.0);
        });

        it('rejects jump mid-air when coyote time has expired', () => {
            const entity = createKinematicsEntity({
                isGrounded: false,
                coyoteTimer: 0.0,
                y: 5.0
            });
            const input = createDefaultInput();
            input.jumpPressed = true;

            updateKinematics(entity, input, 0.016);
            assert.ok(entity.vy <= 0.0); // No jump takeoff applied
        });

        it('buffers jump input and triggers immediately upon landing', () => {
            // Entity falling, presses jump 0.05s before touching ground
            const entity = createKinematicsEntity({
                isGrounded: false,
                y: 0.05,
                vy: -5.0,
                coyoteTimer: 0.0
            });
            const input = createDefaultInput();
            input.jumpPressed = true;
            input.jumpHeld = true;

            // Frame 1: Still airborne, stores buffer
            updateKinematics(entity, input, 0.01);
            assert.ok(entity.jumpBufferTimer > 0.0);

            // Frame 2: Touches ground -> jump buffer consumed and takeoff initiated
            input.jumpPressed = false; // Player released tap
            updateKinematics(entity, input, 0.01);
            assert.ok(entity.vy > 10.0);
            assert.equal(entity.jumpBufferTimer, 0.0);
        });
    });

    describe('Shadow Dodge Roll & Invulnerability', () => {
        it('activates roll, applies 16 m/s speed, sets I-frames and cooldown', () => {
            const entity = createKinematicsEntity({ facing: 1 });
            const input = createDefaultInput();
            input.rollPressed = true;

            updateKinematics(entity, input, 0.016);
            assert.equal(entity.isRolling, true);
            assert.equal(entity.isInvulnerable, true);
            assert.equal(entity.vx, 16.0);
            assert.ok(entity.rollTimer > 0.3);
            assert.ok(entity.rollCooldownTimer > 0.45);
        });

        it('prevents roll re-triggering while cooldown is active', () => {
            const entity = createKinematicsEntity({
                isRolling: false,
                rollCooldownTimer: 0.20 // Cooldown still running
            });
            const input = createDefaultInput();
            input.rollPressed = true;

            updateKinematics(entity, input, 0.016);
            assert.equal(entity.isRolling, false);
            assert.equal(entity.isInvulnerable, false);
        });

        it('accumulates approximately 5.6m displacement over 0.35s roll', () => {
            const entity = createKinematicsEntity({ facing: 1 });
            const input = createDefaultInput();
            input.rollPressed = true;

            const dt = 0.01;
            let totalTime = 0;
            while (totalTime < 0.36) {
                updateKinematics(entity, input, dt);
                input.rollPressed = false;
                totalTime += dt;
            }

            // Expected distance: 16.0 m/s * 0.35s = 5.60m
            assert.ok(Math.abs(entity.x - 5.60) < 0.2);
            assert.equal(entity.isRolling, false);
            assert.equal(entity.isInvulnerable, false);
        });
    });

    describe('Strict 2.5D Plane Constraint & Edge-Case Guards', () => {
        it('snaps Z position and velocity to 0.0 when perturbed beyond tolerance', () => {
            const entity = createKinematicsEntity({ z: 1.5, vz: 10.0 });
            clamp2DPlane(entity, 0.001);
            assert.equal(entity.z, 0.0);
            assert.equal(entity.vz, 0.0);

            entity.z = -5.0;
            enforce2DPlane(entity);
            assert.equal(entity.z, 0.0);
        });

        it('guards against non-positive and NaN delta-time without exploding', () => {
            const entity = createKinematicsEntity({ x: 5.0, y: 2.0 });
            const input = createDefaultInput();

            updateKinematics(entity, input, 0.0);
            assert.equal(entity.x, 5.0);

            updateKinematics(entity, input, -0.05);
            assert.equal(entity.x, 5.0);

            updateKinematics(entity, input, NaN);
            assert.equal(entity.x, 5.0);
        });

        it('clamps downward falling velocity to terminal velocity (-40 m/s)', () => {
            const entity = createKinematicsEntity({
                isGrounded: false,
                y: 100.0,
                vy: -39.0
            });
            const input = createDefaultInput();

            updateKinematics(entity, input, 0.05);
            assert.ok(entity.vy >= -40.0);
            assert.equal(entity.vy, -40.0);
        });
    });

    describe('Elevated Platform Swept Collision & Timestep Clamping', () => {
        it('catches falling entity at terminal velocity (-40 m/s) and lands on elevated platform without tunneling', () => {
            const platform = [{ x: 0, y: 5.0, width: 6.0 }];
            const entity = createKinematicsEntity({ x: 0.0, y: 5.2, vy: -40.0, isGrounded: false });
            const input = createDefaultInput();
            // Step displacement: -40 * 0.016 = -0.64m -> without swept collision y would be 4.56m (< 5.0)
            updateKinematics(entity, input, 0.016, DEFAULT_KINEMATICS_CONFIG, platform);
            assert.equal(entity.y, 5.0, 'Entity must land exactly on platform elevation y=5.0');
            assert.equal(entity.isGrounded, true, 'Entity must be marked isGrounded=true');
            assert.equal(entity.vy, DEFAULT_KINEMATICS_CONFIG.stickyGroundVelocity, 'Sticky ground velocity must be applied');
            assert.equal(entity.coyoteTimer, DEFAULT_KINEMATICS_CONFIG.coyoteTime, 'Coyote timer must be refreshed upon landing');
        });

        it('allows entity jumping upward through elevated platform to pass through freely', () => {
            const platform = [{ x: 0, y: 5.0, width: 6.0 }];
            const entity = createKinematicsEntity({ x: 0.0, y: 4.8, vy: 12.0, isGrounded: false });
            const input = createDefaultInput();
            input.jumpHeld = true;
            updateKinematics(entity, input, 0.016, DEFAULT_KINEMATICS_CONFIG, platform);
            assert.ok(entity.y > 4.8, 'Entity y should ascend past platform');
            assert.equal(entity.isGrounded, false, 'Entity must not be grounded while ascending through platform');
        });

        it('maintains grounded state on elevated platform across consecutive frames with sticky ground velocity', () => {
            const platform = [{ x: 0, y: 5.0, width: 6.0 }];
            const entity = createKinematicsEntity({ x: 0.0, y: 5.0, vy: -2.0, isGrounded: true });
            const input = createDefaultInput();
            for (let frame = 0; frame < 60; frame++) {
                updateKinematics(entity, input, 0.016, DEFAULT_KINEMATICS_CONFIG, platform);
                assert.equal(entity.y, 5.0, `Frame ${frame}: entity must stay glued to y=5.0`);
                assert.equal(entity.isGrounded, true, `Frame ${frame}: entity must stay grounded`);
            }
        });

        it('transitions to ungrounded and preserves coyote time when entity walks off platform ledge', () => {
            const platform = [{ x: 0, y: 5.0, width: 4.0 }]; // Span: [-2.0, 2.0]
            const entity = createKinematicsEntity({ x: 1.9, y: 5.0, isGrounded: true, facing: 1, coyoteTimer: 0.12 });
            const input = createDefaultInput();
            input.horizontal = 1.0;
            updateKinematics(entity, input, 0.02, DEFAULT_KINEMATICS_CONFIG, platform);
            assert.ok(entity.x > 2.0, 'Entity stepped past platform right boundary');
            assert.equal(entity.isGrounded, false, 'Entity must transition to isGrounded=false');
            assert.ok(entity.coyoteTimer > 0, 'Coyote timer must remain active for grace jump');
        });

        it('selects the highest platform when entity falls through multiple horizontally overlapping platforms', () => {
            const platforms = [
                { x: 0, y: 3.0, width: 10.0 },
                { x: 0, y: 7.0, width: 6.0 }
            ];
            const entity = createKinematicsEntity({ x: 0.0, y: 7.2, vy: -40.0, isGrounded: false });
            const input = createDefaultInput();
            updateKinematics(entity, input, 0.016, DEFAULT_KINEMATICS_CONFIG, platforms);
            assert.equal(entity.y, 7.0, 'Entity must land on the top-most platform y=7.0');
            assert.equal(entity.isGrounded, true);
        });

        it('clamps excessive delta-time (dt = 2.0s) to maxDeltaTime (0.05s) preventing physics explosion', () => {
            const entity = createKinematicsEntity({ x: 0.0, y: 0.0, isGrounded: true });
            const input = createDefaultInput();
            input.horizontal = 1.0;
            // Massive frame lag spike: dt = 2.0s
            updateKinematics(entity, input, 2.0, DEFAULT_KINEMATICS_CONFIG);
            // Effective dt = 0.05s -> dx = 9.0 * 0.05 = 0.45m (NOT 18.0m!)
            assert.ok(Math.abs(entity.x - 0.45) < 1e-5, `Entity x must be 0.45m, got ${entity.x}`);
        });

        it('respects custom maxDeltaTime passed in config', () => {
            const entity = createKinematicsEntity({ x: 0.0, y: 0.0, isGrounded: true });
            const input = createDefaultInput();
            input.horizontal = 1.0;
            updateKinematics(entity, input, 2.0, { ...DEFAULT_KINEMATICS_CONFIG, maxDeltaTime: 0.02 });
            // Effective dt = 0.02s -> dx = 9.0 * 0.02 = 0.18m
            assert.ok(Math.abs(entity.x - 0.18) < 1e-5, `Entity x must be 0.18m, got ${entity.x}`);
        });
    });
});
