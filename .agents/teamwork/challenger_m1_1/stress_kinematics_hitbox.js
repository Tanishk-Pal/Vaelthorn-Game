/**
 * Vaelthorn: The Oath of Darkness — Challenger Stress & Fuzz Test Harness
 * Agent: challenger_m1_1 (Role: Empirical Challenger / Adversarial Verification)
 * File: E:\Vaelthorn\.agents\teamwork\challenger_m1_1\stress_kinematics_hitbox.js
 * 
 * Executes 10,000+ iterations across 5 adversarial test suites targeting:
 *  1. Kinematics Numerical Fuzzing (NaNs, Infinities, extreme floats, dt anomalies)
 *  2. High-Velocity Platform Tunneling (Terminal velocity swept collision)
 *  3. Rapid Input Edge Cases (Directional flapping, jump buffer spam, mid-air roll)
 *  4. 2D AABB Geometric Overlap vs Mathematical Oracle (10,000 randomized boxes)
 *  5. Knockback Vector Stability at Delta X = 0 (Coincident positions, extreme forces)
 */

const path = require('node:path');

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
    enforce2DPlane,
    resolveGroundCollision,
    updateKinematics
} = require(path.resolve(__dirname, '../../../src/engine/kinematics.js'));

const {
    HITBOX_CONSTANTS,
    createAABB,
    createAABBFromCenter,
    check2DOverlap,
    computeSwingHitbox,
    computeSwordHitbox,
    createBeamAABB,
    checkRaycastHit,
    checkRayAABBOverlap,
    calculateKnockback,
    HitTracker
} = require(path.resolve(__dirname, '../../../src/engine/hitbox.js'));

// PRNG with seeded deterministic generator for reproducible fuzzing
let seed = 0x1337BEEF;
function pseudoRandom() {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
}

function randomInRange(min, max) {
    return min + pseudoRandom() * (max - min);
}

function pickRandom(arr) {
    return arr[Math.floor(pseudoRandom() * arr.length)];
}

const EXTREME_FLOATS = [
    NaN,
    Infinity,
    -Infinity,
    0.0,
    -0.0,
    1e-15,
    -1e-15,
    1e15,
    -1e15,
    1e308,
    -1e308,
    Number.MAX_VALUE,
    -Number.MAX_VALUE,
    Number.MIN_VALUE,
    Number.EPSILON,
    null,
    undefined,
    'invalid_string',
    {},
    []
];

const results = {
    suite1_kinematics_fuzz: { iterations: 0, crashes: 0, nanLeaks: 0, planeViolations: 0, details: [] },
    suite2_platform_tunneling: {
        ground_tests: 0, ground_tunnels: 0,
        elevated_tests: 0, elevated_tunnels: 0,
        details: []
    },
    suite3_rapid_inputs: { iterations: 0, crashes: 0, nanLeaks: 0, invalidStates: 0, details: [] },
    suite4_aabb_oracle: { iterations: 0, normalized_mismatches: 0, raw_inverted_mismatches: 0, details: [] },
    suite5_knockback_stability: { iterations: 0, crashes: 0, nanLeaks: 0, planeViolations: 0, directionErrors: 0, details: [] }
};

console.log('======================================================================');
console.log('VAELTHORN MILESTONE 1: EMPIRICAL ADVERSARIAL STRESS TEST HARNESS');
console.log('Testing: src/engine/kinematics.js & src/engine/hitbox.js');
console.log('Iterations: 10,000 per suite where applicable');
console.log('======================================================================\n');

// ============================================================================
// SUITE 1: Kinematics Fuzzing & Numerical Integration (10,000 iterations)
// ============================================================================
console.log('--- Running Suite 1: Kinematics Fuzzing (10,000 iterations) ---');
{
    const suite = results.suite1_kinematics_fuzz;
    for (let i = 0; i < 10000; i++) {
        suite.iterations++;

        // Randomize initial entity coordinates with mix of valid and pathological values
        const entity = createKinematicsEntity({
            x: pseudoRandom() < 0.2 ? pickRandom(EXTREME_FLOATS) : randomInRange(-50, 50),
            y: pseudoRandom() < 0.2 ? pickRandom(EXTREME_FLOATS) : randomInRange(0, 50),
            z: pseudoRandom() < 0.2 ? pickRandom(EXTREME_FLOATS) : randomInRange(-10, 10),
            vx: pseudoRandom() < 0.2 ? pickRandom(EXTREME_FLOATS) : randomInRange(-40, 40),
            vy: pseudoRandom() < 0.2 ? pickRandom(EXTREME_FLOATS) : randomInRange(-40, 40),
            vz: pseudoRandom() < 0.2 ? pickRandom(EXTREME_FLOATS) : randomInRange(-10, 10),
            isGrounded: pseudoRandom() < 0.5,
            facing: pseudoRandom() < 0.5 ? -1 : 1,
            coyoteTimer: pseudoRandom() < 0.2 ? pickRandom(EXTREME_FLOATS) : randomInRange(0, 0.2),
            jumpBufferTimer: pseudoRandom() < 0.2 ? pickRandom(EXTREME_FLOATS) : randomInRange(0, 0.2),
            isRolling: pseudoRandom() < 0.3,
            rollTimer: pseudoRandom() < 0.2 ? pickRandom(EXTREME_FLOATS) : randomInRange(0, 0.5),
            rollCooldownTimer: pseudoRandom() < 0.2 ? pickRandom(EXTREME_FLOATS) : randomInRange(0, 1.0)
        });

        // Randomize inputs
        const input = {
            horizontal: pseudoRandom() < 0.15 ? pickRandom(EXTREME_FLOATS) : randomInRange(-2.0, 2.0),
            jumpPressed: pseudoRandom() < 0.3,
            jumpHeld: pseudoRandom() < 0.5,
            rollPressed: pseudoRandom() < 0.2
        };

        // Randomize dt: valid, zero, negative, extreme
        let dt;
        const dtRoll = pseudoRandom();
        if (dtRoll < 0.1) dt = 0.0;
        else if (dtRoll < 0.2) dt = -0.016;
        else if (dtRoll < 0.3) dt = pickRandom(EXTREME_FLOATS);
        else if (dtRoll < 0.4) dt = randomInRange(0.1, 10.0); // Large timesteps
        else dt = randomInRange(0.001, 0.033); // Normal frame deltas

        try {
            updateKinematics(entity, input, dt);

            // Invariant verification
            if (!Number.isFinite(entity.x) || !Number.isFinite(entity.y) ||
                !Number.isFinite(entity.vx) || !Number.isFinite(entity.vy)) {
                suite.nanLeaks++;
                if (suite.details.length < 5) {
                    suite.details.push(`NaN leak on step ${i}: x=${entity.x}, y=${entity.y}, vx=${entity.vx}, vy=${entity.vy}`);
                }
            }

            if (entity.z !== 0.0 || entity.vz !== 0.0) {
                suite.planeViolations++;
                if (suite.details.length < 5) {
                    suite.details.push(`Planar Z violation on step ${i}: z=${entity.z}, vz=${entity.vz}`);
                }
            }
        } catch (err) {
            suite.crashes++;
            if (suite.details.length < 5) {
                suite.details.push(`Unhandled crash on step ${i}: ${err.message}`);
            }
        }
    }
}
console.log(`Suite 1 Results: Iterations=${results.suite1_kinematics_fuzz.iterations}, Crashes=${results.suite1_kinematics_fuzz.crashes}, NaN Leaks=${results.suite1_kinematics_fuzz.nanLeaks}, Plane Violations=${results.suite1_kinematics_fuzz.planeViolations}\n`);

// ============================================================================
// SUITE 2: High-Velocity Tunneling Boundary Checks Through Platforms
// ============================================================================
console.log('--- Running Suite 2: High-Velocity Platform Tunneling ---');
{
    const suite = results.suite2_platform_tunneling;

    // Subtest 2A: Ground Plane Tunneling at Terminal Velocity (-40 m/s)
    for (let i = 0; i < 5000; i++) {
        suite.ground_tests++;
        // Start just above ground
        const startY = randomInRange(0.01, 0.60);
        const vy = randomInRange(-35.0, -40.0); // Terminal velocity range
        const dt = randomInRange(0.016, 0.033); // 30-60 FPS
        const entity = createKinematicsEntity({ x: 0, y: startY, vy: vy, isGrounded: false });
        const input = createDefaultInput();

        updateKinematics(entity, input, dt);

        // Ground level must clamp to 0.0, never < 0.0
        if (entity.y < 0.0) {
            suite.ground_tunnels++;
            if (suite.details.length < 5) {
                suite.details.push(`Ground tunnel on step ${i}: y=${entity.y} < 0.0`);
            }
        }
    }

    // Subtest 2B: Elevated Platform Swept Collision at Terminal Velocity
    // Platform at y = 5.0, width = 6.0, centered at x = 0
    const platforms = [{ x: 0, y: 5.0, width: 6.0 }];
    for (let i = 0; i < 5000; i++) {
        suite.elevated_tests++;
        // Position entity above the platform within its horizontal span [-2.5, 2.5]
        const startX = randomInRange(-2.5, 2.5);
        // Start 0.1m to 0.5m above platform (within 1 single frame displacement at 40m/s)
        const startY = 5.0 + randomInRange(0.05, 0.40);
        const vy = -40.0; // Terminal velocity downward
        const dt = 0.016; // 60 FPS frame delta (step displacement = -0.64m)

        const entity = createKinematicsEntity({
            x: startX,
            y: startY,
            vy: vy,
            isGrounded: false
        });
        const input = createDefaultInput();

        // 1 frame step: displacement is -0.64m. Since startY in [5.05, 5.40],
        // next y would be in [4.41, 4.76] without swept collision.
        // A correct swept collision detector MUST catch the platform at y=5.0 and land the entity!
        updateKinematics(entity, input, dt, DEFAULT_KINEMATICS_CONFIG, platforms);

        // Check if entity landed on platform or tunneled past it
        if (entity.y < 5.0 || !entity.isGrounded) {
            suite.elevated_tunnels++;
            if (suite.details.length < 5) {
                suite.details.push(`Elevated platform tunnel on test ${i}: startY=${startY.toFixed(3)}, resultY=${entity.y.toFixed(3)}, grounded=${entity.isGrounded}`);
            }
        }
    }
}
console.log(`Suite 2 Results:`);
console.log(`  Ground Floor Tests: ${results.suite2_platform_tunneling.ground_tests}, Tunnels: ${results.suite2_platform_tunneling.ground_tunnels}`);
console.log(`  Elevated Platform Tests: ${results.suite2_platform_tunneling.elevated_tests}, Tunnels: ${results.suite2_platform_tunneling.elevated_tunnels}`);
console.log(`  Elevated Platform Tunnel Rate: ${(results.suite2_platform_tunneling.elevated_tunnels / results.suite2_platform_tunneling.elevated_tests * 100).toFixed(2)}%\n`);

// ============================================================================
// SUITE 3: Rapid Edge-Case Inputs & Transitions (10,000 iterations)
// ============================================================================
console.log('--- Running Suite 3: Rapid Edge-Case Inputs (10,000 iterations) ---');
{
    const suite = results.suite3_rapid_inputs;
    const entity = createKinematicsEntity({ x: 0, y: 0, isGrounded: true, facing: 1 });

    for (let i = 0; i < 10000; i++) {
        suite.iterations++;

        const input = createDefaultInput();
        const mode = i % 4;

        if (mode === 0) {
            // Rapid directional reversal (flapping +1 / -1)
            input.horizontal = (i % 2 === 0) ? 1.0 : -1.0;
        } else if (mode === 1) {
            // Jump buffer rapid toggling
            input.jumpPressed = (i % 2 === 0);
            input.jumpHeld = (i % 3 === 0);
        } else if (mode === 2) {
            // Roll attempt during jump or mid-air
            input.rollPressed = true;
            input.horizontal = (i % 2 === 0) ? 1.0 : -1.0;
        } else if (mode === 3) {
            // Simultaneous chord: Horizontal + Jump + Roll all on
            input.horizontal = 1.0;
            input.jumpPressed = true;
            input.jumpHeld = true;
            input.rollPressed = true;
        }

        const dt = 0.016;

        try {
            updateKinematics(entity, input, dt);

            // Invariant verification
            if (!Number.isFinite(entity.x) || !Number.isFinite(entity.y) ||
                !Number.isFinite(entity.vx) || !Number.isFinite(entity.vy)) {
                suite.nanLeaks++;
            }

            // Facing must be either 1 or -1
            if (entity.facing !== 1 && entity.facing !== -1) {
                suite.invalidStates++;
                if (suite.details.length < 5) {
                    suite.details.push(`Corrupt facing state at step ${i}: ${entity.facing}`);
                }
            }

            // Invulnerability must match isRolling unless external source
            if (entity.isRolling && !entity.isInvulnerable) {
                suite.invalidStates++;
                if (suite.details.length < 5) {
                    suite.details.push(`Rolling without invulnerability at step ${i}`);
                }
            }

            // Ground plane check: y must never be below 0
            if (entity.y < 0.0) {
                suite.invalidStates++;
                if (suite.details.length < 5) {
                    suite.details.push(`Entity fell below ground at step ${i}: y=${entity.y}`);
                }
            }
        } catch (err) {
            suite.crashes++;
            if (suite.details.length < 5) {
                suite.details.push(`Crash during rapid input step ${i}: ${err.message}`);
            }
        }
    }
}
console.log(`Suite 3 Results: Iterations=${results.suite3_rapid_inputs.iterations}, Crashes=${results.suite3_rapid_inputs.crashes}, NaN Leaks=${results.suite3_rapid_inputs.nanLeaks}, Invalid States=${results.suite3_rapid_inputs.invalidStates}\n`);

// ============================================================================
// SUITE 4: 2D AABB Overlap vs Mathematical Oracle (10,000 iterations)
// ============================================================================
console.log('--- Running Suite 4: 2D AABB Overlap vs Independent Oracle (10,000 iterations) ---');
{
    const suite = results.suite4_aabb_oracle;

    // Independent reference oracle using normalized intervals
    function oracleOverlap(boxA, boxB, inclusive = true) {
        if (!boxA || !boxB) return false;
        const aMinX = Math.min(boxA.minX, boxA.maxX);
        const aMaxX = Math.max(boxA.minX, boxA.maxX);
        const aMinY = Math.min(boxA.minY, boxA.maxY);
        const aMaxY = Math.max(boxA.minY, boxA.maxY);

        const bMinX = Math.min(boxB.minX, boxB.maxX);
        const bMaxX = Math.max(boxB.minX, boxB.maxX);
        const bMinY = Math.min(boxB.minY, boxB.maxY);
        const bMaxY = Math.max(boxB.minY, boxB.maxY);

        const xOverlap = inclusive
            ? (aMinX <= bMaxX && aMaxX >= bMinX)
            : (aMinX < bMaxX && aMaxX > bMinX);
        const yOverlap = inclusive
            ? (aMinY <= bMaxY && aMaxY >= bMinY)
            : (aMinY < bMaxY && aMaxY > bMinY);

        if (!xOverlap || !yOverlap) return false;

        if (boxA.minZ !== undefined && boxA.maxZ !== undefined &&
            boxB.minZ !== undefined && boxB.maxZ !== undefined) {
            const aMinZ = Math.min(boxA.minZ, boxA.maxZ);
            const aMaxZ = Math.max(boxA.minZ, boxA.maxZ);
            const bMinZ = Math.min(boxB.minZ, boxB.maxZ);
            const bMaxZ = Math.max(boxB.minZ, boxB.maxZ);
            const zOverlap = inclusive
                ? (aMinZ <= bMaxZ && aMaxZ >= bMinZ)
                : (aMinZ < bMaxZ && aMaxZ > bMinZ);
            if (!zOverlap) return false;
        }

        return true;
    }

    for (let i = 0; i < 10000; i++) {
        suite.iterations++;
        const inclusive = pseudoRandom() < 0.5;

        // Generate coordinates
        const x1 = randomInRange(-20, 20);
        const x2 = randomInRange(-20, 20);
        const y1 = randomInRange(-20, 20);
        const y2 = randomInRange(-20, 20);

        const x3 = randomInRange(-20, 20);
        const x4 = randomInRange(-20, 20);
        const y3 = randomInRange(-20, 20);
        const y4 = randomInRange(-20, 20);

        // Case A: Normalized boxes created via createAABB
        const normA = createAABB(x1, y1, x2, y2);
        const normB = createAABB(x3, y3, x4, y4);

        const actualNorm = check2DOverlap(normA, normB, inclusive);
        const expectedNorm = oracleOverlap(normA, normB, inclusive);

        if (actualNorm !== expectedNorm) {
            suite.normalized_mismatches++;
            if (suite.details.length < 5) {
                suite.details.push(`Normalized mismatch at ${i}: actual=${actualNorm}, expected=${expectedNorm}`);
            }
        }

        // Case B: Raw un-normalized objects with intentionally inverted coordinates
        // e.g. minX > maxX
        const rawInvertedA = {
            minX: Math.max(x1, x2),
            maxX: Math.min(x1, x2),
            minY: Math.max(y1, y2),
            maxY: Math.min(y1, y2)
        };
        const rawB = {
            minX: Math.min(x3, x4),
            maxX: Math.max(x3, x4),
            minY: Math.min(y3, y4),
            maxY: Math.max(y3, y4)
        };

        const actualRaw = check2DOverlap(rawInvertedA, rawB, inclusive);
        const expectedRaw = oracleOverlap(rawInvertedA, rawB, inclusive);

        if (actualRaw !== expectedRaw) {
            suite.raw_inverted_mismatches++;
            if (suite.details.length < 5) {
                suite.details.push(`Raw inverted mismatch at ${i}: actual=${actualRaw}, expected=${expectedRaw}, boxA=${JSON.stringify(rawInvertedA)}`);
            }
        }
    }
}
console.log(`Suite 4 Results: Iterations=${results.suite4_aabb_oracle.iterations}`);
console.log(`  Normalized Box Mismatches: ${results.suite4_aabb_oracle.normalized_mismatches}`);
console.log(`  Raw Inverted Box Mismatches (Unsanitized direct caller input): ${results.suite4_aabb_oracle.raw_inverted_mismatches}\n`);

// ============================================================================
// SUITE 5: Knockback Vector Stability under Zero Distance (Delta x = 0)
// ============================================================================
console.log('--- Running Suite 5: Knockback Vector Stability at Delta X = 0 (10,000 iterations) ---');
{
    const suite = results.suite5_knockback_stability;

    for (let i = 0; i < 10000; i++) {
        suite.iterations++;

        const coincidentX = randomInRange(-100, 100);
        const coincidentY = randomInRange(-100, 100);
        const attackerPos = { x: coincidentX, y: coincidentY, z: 0 };
        const targetPos = { x: coincidentX, y: coincidentY, z: 0 };

        const facing = (pseudoRandom() < 0.5) ? 1 : -1;
        const force = pseudoRandom() < 0.1 ? pickRandom(EXTREME_FLOATS) : randomInRange(0, 50);
        const resistance = pseudoRandom() < 0.1 ? pickRandom(EXTREME_FLOATS) : randomInRange(0, 1.2);

        try {
            const kb = calculateKnockback(attackerPos, targetPos, force, facing, resistance);

            if (!Number.isFinite(kb.vx) || !Number.isFinite(kb.vy) || !Number.isFinite(kb.vz)) {
                suite.nanLeaks++;
                if (suite.details.length < 5) {
                    suite.details.push(`Knockback NaN leak at step ${i}: kb=${JSON.stringify(kb)}`);
                }
            }

            if (kb.vz !== 0.0) {
                suite.planeViolations++;
                if (suite.details.length < 5) {
                    suite.details.push(`Knockback planar vz != 0 at step ${i}: vz=${kb.vz}`);
                }
            }

            // Direction check: when delta X == 0, direction must strictly follow facing
            // If facing == 1, vx must be >= 0. If facing == -1, vx must be <= 0.
            if (facing === 1 && kb.vx < 0) {
                suite.directionErrors++;
            } else if (facing === -1 && kb.vx > 0) {
                suite.directionErrors++;
            }
        } catch (err) {
            suite.crashes++;
            if (suite.details.length < 5) {
                suite.details.push(`Crash during knockback step ${i}: ${err.message}`);
            }
        }
    }
}
console.log(`Suite 5 Results: Iterations=${results.suite5_knockback_stability.iterations}, Crashes=${results.suite5_knockback_stability.crashes}, NaN Leaks=${results.suite5_knockback_stability.nanLeaks}, Plane Violations=${results.suite5_knockback_stability.planeViolations}, Direction Errors=${results.suite5_knockback_stability.directionErrors}\n`);

// ============================================================================
// SUMMARY & VERDICT ANALYSIS
// ============================================================================
console.log('======================================================================');
console.log('CHALLENGE SUMMARY & FINDINGS AUDIT');
console.log('======================================================================');

const totalCrashes = results.suite1_kinematics_fuzz.crashes + results.suite3_rapid_inputs.crashes + results.suite5_knockback_stability.crashes;
const totalNaNs = results.suite1_kinematics_fuzz.nanLeaks + results.suite3_rapid_inputs.nanLeaks + results.suite5_knockback_stability.nanLeaks;
const totalPlaneViolations = results.suite1_kinematics_fuzz.planeViolations + results.suite5_knockback_stability.planeViolations;
const elevatedTunnelRate = results.suite2_platform_tunneling.elevated_tunnels / results.suite2_platform_tunneling.elevated_tests;

console.log(`Total Crashes: ${totalCrashes}`);
console.log(`Total NaN / Infinity Leaks: ${totalNaNs}`);
console.log(`Total 2.5D Plane Violations: ${totalPlaneViolations}`);
console.log(`Ground Tunneling Failures: ${results.suite2_platform_tunneling.ground_tunnels}`);
console.log(`Elevated Platform Tunneling Failures: ${results.suite2_platform_tunneling.elevated_tunnels} / ${results.suite2_platform_tunneling.elevated_tests} (${(elevatedTunnelRate * 100).toFixed(2)}%)`);
console.log(`Normalized AABB Oracle Mismatches: ${results.suite4_aabb_oracle.normalized_mismatches}`);
console.log(`Raw Inverted AABB Mismatches: ${results.suite4_aabb_oracle.raw_inverted_mismatches}`);

console.log('\n--- Vulnerability Findings ---');
if (results.suite2_platform_tunneling.elevated_tunnels > 0) {
    console.log('[CRITICAL BUG 1] Elevated Platform Tunneling in resolveGroundCollision():');
    console.log('  Condition `entity.y >= p.y && (entity.y + entity.vy * dt) <= (p.y + 0.1)` is executed AFTER position integration `entity.y += entity.vy * dt`.');
    console.log('  Because entity.y has ALREADY been updated to the post-step position, entity.y is now strictly below p.y!');
    console.log('  As a result, `entity.y >= p.y` evaluates to FALSE, and the platform collision is 100% ignored.');
    console.log('  Falling entities tunnel completely through elevated platforms down to ground level (y=0.0).');
}

if (results.suite4_aabb_oracle.raw_inverted_mismatches > 0) {
    console.log('[HIGH RISK BUG 2] check2DOverlap() Lack of Interval Normalization:');
    console.log('  `check2DOverlap(boxA, boxB)` assumes pre-normalized bounding boxes where minX <= maxX and minY <= maxY.');
    console.log('  If a caller passes a raw un-normalized object (minX > maxX), check2DOverlap yields false-positive collisions.');
    console.log('  Recommendation: Add Math.min/Math.max normalization or assertion inside check2DOverlap().');
}

console.log('\n======================================================================');
if (elevatedTunnelRate > 0) {
    console.log('VERDICT: REQUEST_CHANGES (Elevated platform tunneling bug detected in resolveGroundCollision)');
} else if (totalCrashes > 0 || totalNaNs > 0 || totalPlaneViolations > 0) {
    console.log('VERDICT: REQUEST_CHANGES (Stability / NaN / Planar violations detected)');
} else {
    console.log('VERDICT: APPROVE');
}
console.log('======================================================================');
