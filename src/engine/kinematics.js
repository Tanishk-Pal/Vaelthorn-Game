/**
 * Vaelthorn: The Oath of Darkness — Kinematics Engine
 * File: src/engine/kinematics.js
 * 
 * Pure mathematical 2.5D kinematics engine governing horizontal locomotion,
 * analytical jump takeoff, piecewise game-feel gravity, coyote time, jump buffering,
 * shadow dodge roll with I-frames, and strict Z=0 plane lock.
 */

/**
 * Default kinematics tuning parameters.
 */
const DEFAULT_KINEMATICS_CONFIG = Object.freeze({
    moveSpeed: 9.0,             // Lateral speed in m/s
    jumpHeight: 2.4,            // Target apex jump height in meters
    gravity: -26.0,             // Base downward gravitational acceleration in m/s^2
    fallMultiplier: 1.6,        // Gravity multiplier while falling (vy < 0) -> -41.6 m/s^2
    lowJumpMultiplier: 2.2,     // Gravity multiplier when jump released early -> -57.2 m/s^2
    coyoteTime: 0.12,           // Grace duration after becoming ungrounded in seconds
    jumpBufferTime: 0.12,       // Queue duration for jump input in seconds
    rollSpeed: 16.0,            // Horizontal speed during shadow roll in m/s
    rollDuration: 0.35,         // Active duration of dodge roll in seconds
    rollCooldown: 0.50,         // Cooldown between dodge rolls in seconds
    terminalVelocity: -40.0,    // Clamp on maximum downward falling velocity in m/s
    stickyGroundVelocity: -2.0, // Sticky downward velocity applied while grounded in m/s
    zTolerance: 0.001,          // Maximum allowed depth deviation before snapping to 0.0
    inputDeadzone: 0.10,        // Minimum horizontal input magnitude to update facing direction
    maxDeltaTime: 0.05          // Maximum timestep clamp to prevent physics explosion (50ms)
});

/**
 * Constants dictionary matching engine loader and test assertions.
 */
const Constants = Object.freeze({
    GRAVITY: -26.0,
    FALL_GRAVITY_MULT: 1.6,
    LOW_JUMP_GRAVITY_MULT: 2.2,
    MOVE_SPEED: 9.0,
    ROLL_SPEED: 16.0,
    ROLL_DURATION: 0.35,
    ROLL_COOLDOWN: 0.50,
    COYOTE_TIME: 0.12,
    JUMP_BUFFER_TIME: 0.12,
    JUMP_HEIGHT: 2.4,
    STICKY_GROUND_VELOCITY: -2.0,
    PLANE_TOLERANCE: 0.001,
    MAX_DELTA_TIME: 0.05
});

/**
 * Creates a clean kinematics entity state container with safe defaults.
 * @param {Object} [initialState]
 * @returns {Object}
 */
function createKinematicsEntity(initialState = {}) {
    const cd = Number.isFinite(initialState.rollCooldownTimer)
        ? Math.max(0, initialState.rollCooldownTimer)
        : (Number.isFinite(initialState.rollCooldown) ? Math.max(0, initialState.rollCooldown) : 0.0);

    return {
        x: Number.isFinite(initialState.x) ? initialState.x : 0.0,
        y: Number.isFinite(initialState.y) ? initialState.y : 0.0,
        z: 0.0,
        vx: Number.isFinite(initialState.vx) ? initialState.vx : 0.0,
        vy: Number.isFinite(initialState.vy) ? initialState.vy : 0.0,
        vz: 0.0,
        isGrounded: Boolean(initialState.isGrounded),
        facing: initialState.facing === -1 ? -1 : 1,
        coyoteTimer: Number.isFinite(initialState.coyoteTimer) ? Math.max(0, initialState.coyoteTimer) : 0.0,
        jumpBufferTimer: Number.isFinite(initialState.jumpBufferTimer) ? Math.max(0, initialState.jumpBufferTimer) : 0.0,
        isRolling: Boolean(initialState.isRolling),
        rollTimer: Number.isFinite(initialState.rollTimer) ? Math.max(0, initialState.rollTimer) : 0.0,
        rollCooldownTimer: cd,
        rollCooldown: cd,
        isInvulnerable: Boolean(initialState.isInvulnerable)
    };
}

/**
 * Creates a neutral input object.
 * @returns {Object}
 */
function createDefaultInput() {
    return {
        horizontal: 0.0,
        jumpPressed: false,
        jumpHeld: false,
        rollPressed: false
    };
}

/**
 * Analytically computes initial takeoff velocity required to reach apex height h
 * under base gravitational acceleration g: v_y0 = sqrt(2 * |g| * h).
 * Supports both (gravity, jumpHeight) and (jumpHeight, gravity) parameter orders.
 * 
 * @param {number} [arg1]
 * @param {number} [arg2]
 * @returns {number} Takeoff velocity in m/s
 */
function calculateJumpVelocity(arg1, arg2) {
    let gravity = DEFAULT_KINEMATICS_CONFIG.gravity;
    let jumpHeight = DEFAULT_KINEMATICS_CONFIG.jumpHeight;

    if (arg1 !== undefined && arg2 !== undefined) {
        if (arg1 < 0) {
            gravity = arg1;
            jumpHeight = arg2;
        } else if (arg2 < 0) {
            jumpHeight = arg1;
            gravity = arg2;
        } else if (arg1 > arg2) {
            gravity = -arg1;
            jumpHeight = arg2;
        } else {
            jumpHeight = arg1;
            gravity = -arg2;
        }
    } else if (arg1 !== undefined) {
        if (arg1 < 0) gravity = arg1;
        else jumpHeight = arg1;
    }

    const absG = Math.abs(Number.isFinite(gravity) ? gravity : DEFAULT_KINEMATICS_CONFIG.gravity);
    const safeH = Math.max(0, Number.isFinite(jumpHeight) ? jumpHeight : DEFAULT_KINEMATICS_CONFIG.jumpHeight);
    return Math.sqrt(2.0 * absG * safeH);
}

/**
 * Evaluates piecewise vertical acceleration depending on velocity and jump button state.
 * @param {number} vy - Current vertical velocity (m/s)
 * @param {boolean} jumpHeld - Whether the jump input is currently held
 * @param {Object} [config]
 * @returns {number} Acceleration in m/s^2
 */
function calculateGravityAcceleration(vy, jumpHeld, config = DEFAULT_KINEMATICS_CONFIG) {
    const g = Number.isFinite(config.gravity) ? config.gravity : (config.GRAVITY ?? DEFAULT_KINEMATICS_CONFIG.gravity);
    const fallMul = Number.isFinite(config.fallMultiplier) ? config.fallMultiplier : (config.FALL_GRAVITY_MULT ?? DEFAULT_KINEMATICS_CONFIG.fallMultiplier);
    const lowJumpMul = Number.isFinite(config.lowJumpMultiplier) ? config.lowJumpMultiplier : (config.LOW_JUMP_GRAVITY_MULT ?? DEFAULT_KINEMATICS_CONFIG.lowJumpMultiplier);

    if (vy < 0.0) {
        // Snappy falling
        return g * fallMul;
    } else if (vy > 0.0 && !jumpHeld) {
        // Variable jump cut / short hop
        return g * lowJumpMul;
    } else {
        // Standard upward ascent
        return g;
    }
}

/**
 * Executes a jump on the entity, assigning takeoff velocity and consuming timers.
 * @param {Object} entity
 * @param {Object} [config]
 * @returns {boolean} True if jump was executed
 */
function executeJump(entity, config = DEFAULT_KINEMATICS_CONFIG) {
    if (!entity) return false;
    const g = config.gravity ?? config.GRAVITY ?? DEFAULT_KINEMATICS_CONFIG.gravity;
    const h = config.jumpHeight ?? config.JUMP_HEIGHT ?? DEFAULT_KINEMATICS_CONFIG.jumpHeight;
    const vTakeoff = calculateJumpVelocity(g, h);
    entity.vy = vTakeoff;
    entity.isGrounded = false;
    entity.coyoteTimer = 0.0;
    entity.jumpBufferTimer = 0.0;
    return true;
}

/**
 * Executes a shadow dodge roll on the entity, applying high speed and invulnerability.
 * @param {Object} entity
 * @param {Object} [config]
 * @returns {boolean} True if roll was initiated
 */
function executeRoll(entity, config = DEFAULT_KINEMATICS_CONFIG) {
    if (!entity) return false;
    const cd = entity.rollCooldownTimer ?? entity.rollCooldown ?? 0.0;
    if (entity.isRolling || cd > 0.0) return false;

    const rSpeed = config.rollSpeed ?? config.ROLL_SPEED ?? DEFAULT_KINEMATICS_CONFIG.rollSpeed;
    const rDuration = config.rollDuration ?? config.ROLL_DURATION ?? DEFAULT_KINEMATICS_CONFIG.rollDuration;
    const rCooldown = config.rollCooldown ?? config.ROLL_COOLDOWN ?? DEFAULT_KINEMATICS_CONFIG.rollCooldown;

    entity.isRolling = true;
    entity.rollTimer = rDuration;
    entity.rollCooldownTimer = rCooldown;
    entity.rollCooldown = rCooldown;
    entity.isInvulnerable = true;
    entity.vx = (entity.facing || 1) * rSpeed;
    return true;
}

/**
 * Clamps entity position and velocity strictly to the Z=0 plane.
 * @param {Object} entity
 * @param {number} [tolerance]
 * @returns {Object}
 */
function clamp2DPlane(entity, tolerance = DEFAULT_KINEMATICS_CONFIG.zTolerance) {
    if (!entity) return entity;
    const tol = Number.isFinite(tolerance) ? tolerance : DEFAULT_KINEMATICS_CONFIG.zTolerance;
    if (Math.abs(entity.z) > tol || !Number.isFinite(entity.z)) {
        entity.z = 0.0;
    }
    entity.vz = 0.0;
    return entity;
}

const enforce2DPlane = clamp2DPlane;

/**
 * Resolves vertical collision with ground floor (y=0) and optional elevated platforms.
 * Uses swept step collision to prevent high-velocity tunneling.
 * @param {Object} entity
 * @param {Array<Object>} [platforms]
 * @param {number} [dt]
 * @param {Object} [config]
 * @param {number} [prevY] - Pre-integration vertical coordinate. Reconstructed defensively if omitted.
 */
function resolveGroundCollision(entity, platforms = [], dt = 0.0, config = DEFAULT_KINEMATICS_CONFIG, prevY = undefined) {
    let groundLevel = entity.groundLevel !== undefined ? entity.groundLevel : 0.0;

    const priorY = (prevY !== undefined && Number.isFinite(prevY))
        ? prevY
        : ((Number.isFinite(entity.y) && Number.isFinite(entity.vy) && Number.isFinite(dt))
            ? (entity.y - entity.vy * dt)
            : entity.y);

    const currentY = entity.y;

    // Check elevated platforms
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

/**
 * Master kinematics update step.
 * Integrates horizontal locomotion, jump mechanics, piecewise gravity,
 * game-feel timers, shadow dodge roll, and 2.5D plane constraint.
 * 
 * @param {Object} entity - State of the entity to update (mutated in place and returned).
 * @param {Object} input - User or AI input commands.
 * @param {number} dt - Timestep delta in seconds.
 * @param {Object} [config] - Physics tuning configuration.
 * @param {Array<Object>} [platforms] - Optional array of static platforms.
 * @returns {Object} Updated entity state.
 */
function updateKinematics(entity, input, dt, config = undefined, platforms = []) {
    if (!entity) return entity;

    // 1. Guard against non-positive or invalid delta-time
    if (!Number.isFinite(dt) || dt <= 0.0) {
        clamp2DPlane(entity, config ? (config.zTolerance ?? config.PLANE_TOLERANCE) : DEFAULT_KINEMATICS_CONFIG.zTolerance);
        return entity;
    }

    // Clamp delta-time against maxDeltaTime to prevent physics explosion / tunneling
    if (config) {
        const maxDt = Number.isFinite(config.maxDeltaTime)
            ? config.maxDeltaTime
            : (Number.isFinite(config.MAX_DELTA_TIME)
                ? config.MAX_DELTA_TIME
                : DEFAULT_KINEMATICS_CONFIG.maxDeltaTime);
        if (maxDt > 0) {
            dt = Math.min(maxDt, dt);
        }
    }

    const cfg = config || DEFAULT_KINEMATICS_CONFIG;

    // Defensive NaN / Infinity guards on entity coordinates
    if (!Number.isFinite(entity.x)) entity.x = 0.0;
    if (!Number.isFinite(entity.y)) entity.y = 0.0;
    if (!Number.isFinite(entity.z)) entity.z = 0.0;
    if (!Number.isFinite(entity.vx)) entity.vx = 0.0;
    if (!Number.isFinite(entity.vy)) entity.vy = 0.0;
    if (!Number.isFinite(entity.vz)) entity.vz = 0.0;

    clamp2DPlane(entity, cfg.zTolerance ?? cfg.PLANE_TOLERANCE);

    // Synchronize rollCooldownTimer and rollCooldown
    if (entity.rollCooldownTimer === undefined && entity.rollCooldown !== undefined) {
        entity.rollCooldownTimer = entity.rollCooldown;
    }

    // Sanitize input
    const rawH = (input && Number.isFinite(input.horizontal)) ? input.horizontal : 0.0;
    const clampedH = Math.max(-1.0, Math.min(1.0, rawH));
    const jumpPressed = Boolean(input && input.jumpPressed);
    const jumpHeld = Boolean(input && input.jumpHeld);
    const rollPressed = Boolean(input && input.rollPressed);

    const moveSpeed = cfg.moveSpeed ?? cfg.MOVE_SPEED ?? DEFAULT_KINEMATICS_CONFIG.moveSpeed;
    const rollSpeed = cfg.rollSpeed ?? cfg.ROLL_SPEED ?? DEFAULT_KINEMATICS_CONFIG.rollSpeed;
    const rollDuration = cfg.rollDuration ?? cfg.ROLL_DURATION ?? DEFAULT_KINEMATICS_CONFIG.rollDuration;
    const rollCooldown = cfg.rollCooldown ?? cfg.ROLL_COOLDOWN ?? DEFAULT_KINEMATICS_CONFIG.rollCooldown;
    const coyoteTime = cfg.coyoteTime ?? cfg.COYOTE_TIME ?? DEFAULT_KINEMATICS_CONFIG.coyoteTime;
    const jumpBufferTime = cfg.jumpBufferTime ?? cfg.JUMP_BUFFER_TIME ?? DEFAULT_KINEMATICS_CONFIG.jumpBufferTime;
    const termVel = cfg.terminalVelocity ?? DEFAULT_KINEMATICS_CONFIG.terminalVelocity;
    const deadzone = cfg.inputDeadzone ?? DEFAULT_KINEMATICS_CONFIG.inputDeadzone;

    // 2. Decrement timers
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

    // 3. Handle Shadow Dodge Roll
    if (rollPressed && !entity.isRolling && (entity.rollCooldownTimer || 0) <= 0.0) {
        executeRoll(entity, cfg);
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
        // 4. Handle Horizontal Locomotion & Facing Flip (when not rolling)
        entity.vx = clampedH * moveSpeed;
        if (clampedH > deadzone) {
            entity.facing = 1;
        } else if (clampedH < -deadzone) {
            entity.facing = -1;
        }
    }

    // 5. Jump Execution Trigger (Jump Buffer + Coyote Time / Grounded)
    const canCoyoteJump = entity.coyoteTimer > 0.0;
    const wantsJump = jumpPressed || entity.jumpBufferTimer > 0.0;
    const groundLevel = entity.groundLevel !== undefined ? entity.groundLevel : 0.0;
    const isAtGround = entity.isGrounded || (entity.y <= groundLevel);

    if (wantsJump && (isAtGround || canCoyoteJump)) {
        executeJump(entity, cfg);
    }

    // 6. Vertical Gravity Acceleration (Piecewise)
    if (!entity.isGrounded) {
        const ay = calculateGravityAcceleration(entity.vy, jumpHeld, cfg);
        entity.vy += ay * dt;

        // Terminal velocity clamp
        if (entity.vy < termVel) {
            entity.vy = termVel;
        }
    }

    // 7. Symplectic (Semi-Implicit) Euler Position Integration
    const prevY = entity.y;
    entity.x += entity.vx * dt;
    entity.y += entity.vy * dt;

    // 8. Ground & Platform Collision Resolution
    resolveGroundCollision(entity, platforms, dt, cfg, prevY);

    // 9. Enforce 2.5D Plane Constraint
    clamp2DPlane(entity, cfg.zTolerance ?? cfg.PLANE_TOLERANCE);

    // 10. Fallback NaN sanitization
    if (!Number.isFinite(entity.x)) entity.x = 0.0;
    if (!Number.isFinite(entity.y)) entity.y = 0.0;
    if (!Number.isFinite(entity.vx)) entity.vx = 0.0;
    if (!Number.isFinite(entity.vy)) entity.vy = 0.0;

    return entity;
}

// Module export bindings for CommonJS and ESM
const kinematicsModule = {
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
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = kinematicsModule;
}
if (typeof window !== 'undefined') {
    window.VaelthornKinematics = kinematicsModule;
}
