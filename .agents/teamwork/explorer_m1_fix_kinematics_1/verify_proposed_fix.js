/**
 * Verification script for explorer_m1_fix_kinematics_1
 * Comprehensive test harness for all 7 platform swept collision and timestep clamping test cases.
 */

const path = require('node:path');
const assert = require('node:assert/strict');

const {
    DEFAULT_KINEMATICS_CONFIG,
    Constants: KinematicsConstants,
    createKinematicsEntity,
    createDefaultInput,
    calculateJumpVelocity,
    calculateGravityAcceleration,
    executeJump,
    executeRoll,
    clamp2DPlane,
    enforce2DPlane
} = require(path.resolve(__dirname, '../../../src/engine/kinematics.js'));

// Proposed Constants with MAX_DELTA_TIME
const ProposedConstants = Object.freeze({
    ...KinematicsConstants,
    MAX_DELTA_TIME: 0.05
});

// --- Proposed resolveGroundCollision ---
function proposedResolveGroundCollision(entity, platforms = [], dt = 0.0, config = DEFAULT_KINEMATICS_CONFIG, prevY = undefined) {
    let groundLevel = entity.groundLevel !== undefined ? entity.groundLevel : 0.0;

    const priorY = (prevY !== undefined && Number.isFinite(prevY))
        ? prevY
        : ((Number.isFinite(entity.y) && Number.isFinite(entity.vy) && Number.isFinite(dt))
            ? (entity.y - entity.vy * dt)
            : entity.y);

    const currentY = entity.y;

    if (Array.isArray(platforms) && platforms.length > 0) {
        for (let i = 0; i < platforms.length; i++) {
            const p = platforms[i];
            if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.width)) continue;

            const halfW = p.width * 0.5;
            if (entity.x >= (p.x - halfW) && entity.x <= (p.x + halfW)) {
                // Swept collision: entity must be descending or stationary (vy <= 0)
                if (entity.vy <= 0.0) {
                    const wasAbove = priorY >= (p.y - 0.01);
                    const nowAtOrBelow = currentY <= (p.y + 0.001);
                    if (wasAbove && nowAtOrBelow) {
                        if (p.y > groundLevel) {
                            groundLevel = p.y;
                        }
                    }
                }
            }
        }
    }

    const coyote = config.coyoteTime ?? config.COYOTE_TIME ?? DEFAULT_KINEMATICS_CONFIG.coyoteTime;
    const sticky = config.stickyGroundVelocity ?? config.STICKY_GROUND_VELOCITY ?? DEFAULT_KINEMATICS_CONFIG.stickyGroundVelocity;

    if (entity.y <= (groundLevel + 0.001)) {
        entity.y = groundLevel;
        entity.vy = sticky;
        entity.isGrounded = true;
        entity.coyoteTimer = coyote;
    } else {
        entity.isGrounded = false;
    }
}

// --- Proposed updateKinematics ---
function proposedUpdateKinematics(entity, input, dt, config = DEFAULT_KINEMATICS_CONFIG, platforms = []) {
    if (!entity) return entity;

    if (!Number.isFinite(dt) || dt <= 0.0) {
        clamp2DPlane(entity, config.zTolerance ?? config.PLANE_TOLERANCE);
        return entity;
    }

    // Delta-time clamp
    const maxDt = (config && Number.isFinite(config.maxDeltaTime))
        ? config.maxDeltaTime
        : ((config && Number.isFinite(config.MAX_DELTA_TIME))
            ? config.MAX_DELTA_TIME
            : DEFAULT_KINEMATICS_CONFIG.maxDeltaTime);
    const effectiveDt = Math.min(maxDt, dt);
    dt = effectiveDt;

    if (!Number.isFinite(entity.x)) entity.x = 0.0;
    if (!Number.isFinite(entity.y)) entity.y = 0.0;
    if (!Number.isFinite(entity.z)) entity.z = 0.0;
    if (!Number.isFinite(entity.vx)) entity.vx = 0.0;
    if (!Number.isFinite(entity.vy)) entity.vy = 0.0;
    if (!Number.isFinite(entity.vz)) entity.vz = 0.0;

    clamp2DPlane(entity, config.zTolerance ?? config.PLANE_TOLERANCE);

    if (entity.rollCooldownTimer === undefined && entity.rollCooldown !== undefined) {
        entity.rollCooldownTimer = entity.rollCooldown;
    }

    const rawH = (input && Number.isFinite(input.horizontal)) ? input.horizontal : 0.0;
    const clampedH = Math.max(-1.0, Math.min(1.0, rawH));
    const jumpPressed = Boolean(input && input.jumpPressed);
    const jumpHeld = Boolean(input && input.jumpHeld);
    const rollPressed = Boolean(input && input.rollPressed);

    const moveSpeed = config.moveSpeed ?? config.MOVE_SPEED ?? DEFAULT_KINEMATICS_CONFIG.moveSpeed;
    const rollSpeed = config.rollSpeed ?? config.ROLL_SPEED ?? DEFAULT_KINEMATICS_CONFIG.rollSpeed;
    const rollDuration = config.rollDuration ?? config.ROLL_DURATION ?? DEFAULT_KINEMATICS_CONFIG.rollDuration;
    const rollCooldown = config.rollCooldown ?? config.ROLL_COOLDOWN ?? DEFAULT_KINEMATICS_CONFIG.rollCooldown;
    const coyoteTime = config.coyoteTime ?? config.COYOTE_TIME ?? DEFAULT_KINEMATICS_CONFIG.coyoteTime;
    const jumpBufferTime = config.jumpBufferTime ?? config.JUMP_BUFFER_TIME ?? DEFAULT_KINEMATICS_CONFIG.jumpBufferTime;
    const termVel = config.terminalVelocity ?? DEFAULT_KINEMATICS_CONFIG.terminalVelocity;
    const deadzone = config.inputDeadzone ?? DEFAULT_KINEMATICS_CONFIG.inputDeadzone;

    if (entity.rollCooldownTimer > 0.0) {
        entity.rollCooldownTimer = Math.max(0.0, entity.rollCooldownTimer - dt);
        entity.rollCooldown = entity.rollCooldownTimer;
    } else {
        entity.rollCooldown = 0.0;
    }

    if (jumpPressed) {
        entity.jumpBufferTimer = jumpBufferTime;
    } else if (entity.jumpBufferTimer > 0.0) {
        entity.jumpBufferTimer = Math.max(0.0, entity.jumpBufferTimer - dt);
    }

    if (!entity.isGrounded && entity.coyoteTimer > 0.0) {
        entity.coyoteTimer = Math.max(0.0, entity.coyoteTimer - dt);
    }

    if (rollPressed && !entity.isRolling && (entity.rollCooldownTimer || 0) <= 0.0) {
        executeRoll(entity, config);
    }

    if (entity.isRolling) {
        entity.rollTimer -= dt;
        entity.isInvulnerable = true;
        if (entity.rollTimer <= 0.0) {
            entity.isRolling = false;
            entity.rollTimer = 0.0;
            entity.isInvulnerable = false;
            entity.rollCooldownTimer = rollCooldown;
            entity.rollCooldown = rollCooldown;
        } else {
            entity.vx = (entity.facing || 1) * rollSpeed;
        }
    } else {
        entity.vx = clampedH * moveSpeed;
        if (clampedH > deadzone) {
            entity.facing = 1;
        } else if (clampedH < -deadzone) {
            entity.facing = -1;
        }
    }

    const canCoyoteJump = entity.coyoteTimer > 0.0;
    const wantsJump = jumpPressed || entity.jumpBufferTimer > 0.0;
    const groundLevel = entity.groundLevel !== undefined ? entity.groundLevel : 0.0;
    const isAtGround = entity.isGrounded || (entity.y <= groundLevel);

    if (wantsJump && (isAtGround || canCoyoteJump)) {
        executeJump(entity, config);
    }

    if (!entity.isGrounded) {
        const ay = calculateGravityAcceleration(entity.vy, jumpHeld, config);
        entity.vy += ay * dt;

        if (entity.vy < termVel) {
            entity.vy = termVel;
        }
    }

    // 7. Symplectic Euler Position Integration with prevY capture
    const prevY = entity.y;
    entity.x += entity.vx * dt;
    entity.y += entity.vy * dt;

    // 8. Ground & Platform Collision Resolution with prevY
    proposedResolveGroundCollision(entity, platforms, dt, config, prevY);

    // 9. Enforce 2.5D Plane Constraint
    clamp2DPlane(entity, config.zTolerance ?? config.PLANE_TOLERANCE);

    // 10. Fallback NaN sanitization
    if (!Number.isFinite(entity.x)) entity.x = 0.0;
    if (!Number.isFinite(entity.y)) entity.y = 0.0;
    if (!Number.isFinite(entity.vx)) entity.vx = 0.0;
    if (!Number.isFinite(entity.vy)) entity.vy = 0.0;

    return entity;
}

// ============================================================================
// VERIFICATION OF THE 7 TEST CASES PROPOSED FOR KINEMATICS.TEST.JS
// ============================================================================

console.log('--- Test Case 1: Terminal velocity swept landing without tunneling ---');
{
    const platform = [{ x: 0, y: 5.0, width: 6.0 }];
    const entity = createKinematicsEntity({ x: 0.0, y: 5.2, vy: -40.0, isGrounded: false });
    const input = createDefaultInput();
    // Step displacement: -40 * 0.016 = -0.64m -> without swept collision y would be 4.56m (< 5.0)
    proposedUpdateKinematics(entity, input, 0.016, DEFAULT_KINEMATICS_CONFIG, platform);
    assert.equal(entity.y, 5.0, 'Entity must land exactly on platform elevation y=5.0');
    assert.equal(entity.isGrounded, true, 'Entity must be marked isGrounded=true');
    assert.equal(entity.vy, DEFAULT_KINEMATICS_CONFIG.stickyGroundVelocity, 'Sticky ground velocity must be applied');
    assert.equal(entity.coyoteTimer, DEFAULT_KINEMATICS_CONFIG.coyoteTime, 'Coyote timer must be refreshed upon landing');
    console.log('Test 1 PASS');
}

console.log('--- Test Case 2: Upward jump passes through one-way platform ---');
{
    const platform = [{ x: 0, y: 5.0, width: 6.0 }];
    // Entity jumping upward from y=4.8 through platform at y=5.0
    const entity = createKinematicsEntity({ x: 0.0, y: 4.8, vy: 12.0, isGrounded: false });
    const input = createDefaultInput();
    input.jumpHeld = true;
    proposedUpdateKinematics(entity, input, 0.016, DEFAULT_KINEMATICS_CONFIG, platform);
    assert.ok(entity.y > 4.8, `Entity y should ascend: ${entity.y}`);
    assert.equal(entity.isGrounded, false, 'Entity must not be grounded while ascending through platform');
    console.log('Test 2 PASS');
}

console.log('--- Test Case 3: Sticky velocity adheres grounded entity across consecutive frames ---');
{
    const platform = [{ x: 0, y: 5.0, width: 6.0 }];
    const entity = createKinematicsEntity({ x: 0.0, y: 5.0, vy: -2.0, isGrounded: true });
    const input = createDefaultInput();
    for (let frame = 0; frame < 60; frame++) {
        proposedUpdateKinematics(entity, input, 0.016, DEFAULT_KINEMATICS_CONFIG, platform);
        assert.equal(entity.y, 5.0, `Frame ${frame}: entity must stay glued to y=5.0`);
        assert.equal(entity.isGrounded, true, `Frame ${frame}: entity must stay grounded`);
    }
    console.log('Test 3 PASS');
}

console.log('--- Test Case 4: Walking off platform edge triggers coyote time ---');
{
    const platform = [{ x: 0, y: 5.0, width: 4.0 }]; // Span: [-2.0, 2.0]
    const entity = createKinematicsEntity({ x: 1.9, y: 5.0, isGrounded: true, facing: 1, coyoteTimer: 0.12 });
    const input = createDefaultInput();
    input.horizontal = 1.0;
    // Step forward: 1.9 + 9.0 * 0.02 = 2.08 > 2.0 (past right edge)
    proposedUpdateKinematics(entity, input, 0.02, DEFAULT_KINEMATICS_CONFIG, platform);
    assert.ok(entity.x > 2.0, 'Entity stepped past platform right boundary');
    assert.equal(entity.isGrounded, false, 'Entity must transition to isGrounded=false');
    assert.ok(entity.coyoteTimer > 0, 'Coyote timer must remain active for grace jump');
    console.log('Test 4 PASS');
}

console.log('--- Test Case 5: Highest platform selection with overlapping platforms ---');
{
    const platforms = [
        { x: 0, y: 3.0, width: 10.0 }, // Lower platform
        { x: 0, y: 7.0, width: 6.0 }   // Higher platform
    ];
    // Falling from y=7.2 through both platforms
    const entity = createKinematicsEntity({ x: 0.0, y: 7.2, vy: -40.0, isGrounded: false });
    const input = createDefaultInput();
    proposedUpdateKinematics(entity, input, 0.016, DEFAULT_KINEMATICS_CONFIG, platforms);
    assert.equal(entity.y, 7.0, 'Entity must land on the top-most platform y=7.0, not tunnel to y=3.0');
    assert.equal(entity.isGrounded, true);
    console.log('Test 5 PASS');
}

console.log('--- Test Case 6: Excessive dt clamped to maxDeltaTime (0.05s) ---');
{
    const entity = createKinematicsEntity({ x: 0.0, y: 0.0, isGrounded: true });
    const input = createDefaultInput();
    input.horizontal = 1.0;
    // Massive frame lag spike: dt = 2.0s
    proposedUpdateKinematics(entity, input, 2.0, DEFAULT_KINEMATICS_CONFIG);
    // Effective dt = 0.05s -> dx = 9.0 * 0.05 = 0.45m (NOT 18.0m!)
    assert.ok(Math.abs(entity.x - 0.45) < 1e-5, `Entity x must be 0.45m, got ${entity.x}`);
    console.log('Test 6 PASS');
}

console.log('--- Test Case 7: Custom maxDeltaTime in config overrides default ---');
{
    const entity = createKinematicsEntity({ x: 0.0, y: 0.0, isGrounded: true });
    const input = createDefaultInput();
    input.horizontal = 1.0;
    proposedUpdateKinematics(entity, input, 2.0, { ...DEFAULT_KINEMATICS_CONFIG, maxDeltaTime: 0.02 });
    // Effective dt = 0.02s -> dx = 9.0 * 0.02 = 0.18m
    assert.ok(Math.abs(entity.x - 0.18) < 1e-5, `Entity x must be 0.18m, got ${entity.x}`);
    console.log('Test 7 PASS');
}

console.log('\n=============================================================');
console.log('ALL 7 KINEMATICS REMEDIATION TEST CASES VERIFIED PERFECTLY!');
console.log('=============================================================');
