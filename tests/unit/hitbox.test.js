const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
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
} = require('../../src/engine/hitbox.js');

describe('Hitbox Engine Unit Test Suite', () => {

    describe('AABB Construction & 2D Overlap Theorem', () => {
        it('normalizes coordinate inversions when creating AABBs', () => {
            const box = createAABB(10, 20, 2, 5, 1, -1);
            assert.equal(box.minX, 2);
            assert.equal(box.maxX, 10);
            assert.equal(box.minY, 5);
            assert.equal(box.maxY, 20);
            assert.equal(box.minZ, -1);
            assert.equal(box.maxZ, 1);
        });

        it('creates AABB correctly from center coordinates and half-extents', () => {
            const box = createAABBFromCenter(5, 10, 2, 4);
            assert.equal(box.minX, 3);
            assert.equal(box.maxX, 7);
            assert.equal(box.minY, 6);
            assert.equal(box.maxY, 14);
        });

        it('evaluates TV-1 test vectors for 2D AABB Overlap', () => {
            // TV-1.1: Intersecting boxes
            const b1A = { minX: 0, maxX: 4, minY: 0, maxY: 2, minZ: -0.5, maxZ: 0.5 };
            const b1B = { minX: 3, maxX: 6, minY: 1, maxY: 3, minZ: -0.5, maxZ: 0.5 };
            assert.equal(check2DOverlap(b1A, b1B, true), true);
            assert.equal(check2DOverlap(b1A, b1B, false), true);

            // TV-1.2: Disjoint on X
            const b2A = { minX: 0, maxX: 2, minY: 0, maxY: 2 };
            const b2B = { minX: 3, maxX: 5, minY: 0, maxY: 2 };
            assert.equal(check2DOverlap(b2A, b2B), false);

            // TV-1.3: Disjoint on Y
            const b3A = { minX: 0, maxX: 2, minY: 0, maxY: 2 };
            const b3B = { minX: 0, maxX: 2, minY: 3, maxY: 5 };
            assert.equal(check2DOverlap(b3A, b3B), false);

            // TV-1.4: Touching on boundary edge (x = 3)
            const b4A = { minX: 0, maxX: 3, minY: 0, maxY: 2 };
            const b4B = { minX: 3, maxX: 6, minY: 0, maxY: 2 };
            assert.equal(check2DOverlap(b4A, b4B, true), true);
            assert.equal(check2DOverlap(b4A, b4B, false), false);

            // TV-1.5: Complete containment
            const b5A = { minX: 1, maxX: 5, minY: 1, maxY: 5 };
            const b5B = { minX: 2, maxX: 4, minY: 2, maxY: 4 };
            assert.equal(check2DOverlap(b5A, b5B), true);

            // TV-1.6: Depth disjoint on Z
            const b6A = { minX: 0, maxX: 4, minY: 0, maxY: 2, minZ: -0.2, maxZ: 0.2 };
            const b6B = { minX: 2, maxX: 5, minY: 1, maxY: 3, minZ: 2.0, maxZ: 3.0 };
            assert.equal(check2DOverlap(b6A, b6B), false);
        });

        it('handles un-normalized / inverted AABB intervals without false positives or false negatives', () => {
            // Case 1: Inverted X and Y on boxA vs normal boxB (Overlapping)
            const invertedA = { minX: 10, maxX: 0, minY: 5, maxY: 0 };
            const normalB = { minX: 4, maxX: 6, minY: 1, maxY: 3 };
            assert.equal(check2DOverlap(invertedA, normalB), true, 'Inverted boxA must overlap normal boxB');

            // Case 2: Inverted X and Y on boxA vs normal boxB (Disjoint)
            const disjointB = { minX: 20, maxX: 25, minY: 20, maxY: 25 };
            assert.equal(check2DOverlap(invertedA, disjointB), false, 'Inverted boxA must not overlap disjoint boxB');

            // Case 3: Both boxA and boxB inverted (Overlapping)
            const invertedB1 = { minX: 15, maxX: 5, minY: 15, maxY: 5 };
            assert.equal(check2DOverlap(invertedA, invertedB1), true, 'Both inverted boxes must overlap');

            // Case 4: Both boxA and boxB inverted (Disjoint)
            const invertedB2 = { minX: 30, maxX: 20, minY: 30, maxY: 20 };
            assert.equal(check2DOverlap(invertedA, invertedB2), false, 'Both inverted boxes must not overlap when disjoint');

            // Case 5: Touching boundary edge with inverted intervals
            const touchingA = { minX: 3, maxX: 0, minY: 2, maxY: 0 };
            const touchingB = { minX: 6, maxX: 3, minY: 2, maxY: 0 };
            assert.equal(check2DOverlap(touchingA, touchingB, true), true, 'Touching edge inclusive must be true');
            assert.equal(check2DOverlap(touchingA, touchingB, false), false, 'Touching edge exclusive must be false');

            // Case 6: Inverted Z depth alignment
            const zInvertedA = { minX: 0, maxX: 4, minY: 0, maxY: 2, minZ: 0.5, maxZ: -0.5 };
            const zInvertedB = { minX: 2, maxX: 5, minY: 1, maxY: 3, minZ: 0.2, maxZ: -0.2 };
            assert.equal(check2DOverlap(zInvertedA, zInvertedB), true, 'Inverted Z intervals overlapping must return true');

            const zDisjointB = { minX: 2, maxX: 5, minY: 1, maxY: 3, minZ: 3.0, maxZ: 2.0 };
            assert.equal(check2DOverlap(zInvertedA, zDisjointB), false, 'Inverted Z intervals disjoint must return false');
        });

        it('handles un-normalized / inverted boxes in checkRayAABBOverlap', () => {
            const invertedBox = { minX: 10, maxX: 8, minY: 2, maxY: 0 };
            const origin = { x: 0.0, y: 1.0 };
            const dir = { x: 1.0, y: 0.0 };
            const res = checkRayAABBOverlap(origin, dir, 20.0, invertedBox);
            assert.equal(res.hit, true, 'Ray must hit inverted box volume');
            assert.ok(Math.abs(res.distance - 8.0) < 1e-5, 'Hit distance must be 8.0');
            assert.ok(Math.abs(res.point.x - 8.0) < 1e-5, 'Hit point X must be 8.0');
            assert.ok(Math.abs(res.point.y - 1.0) < 1e-5, 'Hit point Y must be 1.0');
        });
    });

    describe('Prototype Vulnerability Resolution (Elevation & Vertical Misses)', () => {
        // Attacker: Kaelen at base (0.0, 0.0), facing right
        const attackerSwing = computeSwingHitbox({ x: 0.0, y: 0.0 }, 1, {
            reach: 2.4,
            height: 1.8,
            yOffset: 0.9,
            rearOffset: 0.2
        });

        it('hits grounded enemy within reach and height', () => {
            const enemyGrounded = { minX: 1.6, maxX: 2.4, minY: 0.0, maxY: 1.8 };
            assert.equal(check2DOverlap(attackerSwing, enemyGrounded), true);
        });

        it('resolves prototype false-positive bug: misses elevated enemy on high platform', () => {
            // In graybox prototype, this registered a hit because dist < 2.4 on X axis
            const enemyElevated = { minX: 1.6, maxX: 2.4, minY: 4.0, maxY: 5.8 };
            assert.equal(check2DOverlap(attackerSwing, enemyElevated), false);
        });

        it('resolves prototype false-positive bug: jumping player misses grounded enemy', () => {
            // Player swings at jump apex y = 2.4m
            const jumpingSwing = computeSwingHitbox({ x: 0.0, y: 2.4 }, 1, {
                reach: 2.4,
                height: 1.8,
                yOffset: 0.9,
                rearOffset: 0.2
            });
            const enemyGrounded = { minX: 1.6, maxX: 2.4, minY: 0.0, maxY: 1.8 };
            assert.equal(check2DOverlap(jumpingSwing, enemyGrounded), false);
        });
    });

    describe('Attack Swing Hitbox Bounds Calculation', () => {
        it('computes exact bounds for facing right (+1)', () => {
            const box = computeSwingHitbox({ x: 10.0, y: 2.0 }, 1, {
                reach: 2.4,
                height: 1.8,
                yOffset: 0.9,
                rearOffset: 0.2
            });
            assert.ok(Math.abs(box.minX - 9.8) < 1e-5);
            assert.ok(Math.abs(box.maxX - 12.4) < 1e-5);
            assert.ok(Math.abs(box.minY - 2.0) < 1e-5);
            assert.ok(Math.abs(box.maxY - 3.8) < 1e-5);
        });

        it('computes exact bounds for facing left (-1)', () => {
            const box = computeSwingHitbox({ x: 10.0, y: 2.0 }, -1, {
                reach: 2.4,
                height: 1.8,
                yOffset: 0.9,
                rearOffset: 0.2
            });
            assert.ok(Math.abs(box.minX - 7.6) < 1e-5);
            assert.ok(Math.abs(box.maxX - 10.2) < 1e-5);
            assert.ok(Math.abs(box.minY - 2.0) < 1e-5);
            assert.ok(Math.abs(box.maxY - 3.8) < 1e-5);
        });

        it('computes forward reach hitbox matching engine loader contract', () => {
            const box = computeSwordHitbox({ x: 2.0, y: 0.0 }, 1, 2.4, 1.8);
            assert.equal(box.minX, 2.0);
            assert.equal(box.maxX, 4.4);
            assert.ok(box.maxY >= 1.8);
        });
    });

    describe('Stygian Lance Piercing Beam AABB', () => {
        it('computes 16m piercing beam bounding box and tests line-of-fire targets', () => {
            const beam = createBeamAABB({ x: 5.0, y: 2.2 }, 1, 16.0, 1.0);
            assert.equal(beam.minX, 5.0);
            assert.equal(beam.maxX, 21.0);
            assert.ok(Math.abs(beam.minY - 1.7) < 1e-5);
            assert.ok(Math.abs(beam.maxY - 2.7) < 1e-5);

            // Target A: In line
            assert.equal(check2DOverlap(beam, { minX: 14.0, maxX: 14.8, minY: 1.5, maxY: 3.0 }), true);
            // Target B: Behind origin
            assert.equal(check2DOverlap(beam, { minX: 2.0, maxX: 2.8, minY: 1.5, maxY: 3.0 }), false);
            // Target C: Out of range (> 21.0)
            assert.equal(check2DOverlap(beam, { minX: 22.0, maxX: 22.8, minY: 1.5, maxY: 3.0 }), false);
            // Target D: Above beam
            assert.equal(check2DOverlap(beam, { minX: 10.0, maxX: 10.8, minY: 3.5, maxY: 5.0 }), false);
        });

        it('evaluates checkRaycastHit helper correctly', () => {
            const hit = checkRaycastHit({ x: 0, y: 0 }, 1, 16.0, { minX: 10, maxX: 11, minY: 0.5, maxY: 1.5 });
            assert.equal(hit, true);

            const miss = checkRaycastHit({ x: 0, y: 0 }, 1, 16.0, { minX: 18, maxX: 19, minY: 0.5, maxY: 1.5 });
            assert.equal(miss, false);
        });
    });

    describe('Slab-Method Raycast vs AABB', () => {
        it('calculates exact contact point for intersecting ray', () => {
            const rayOrigin = { x: 0.0, y: 1.5 };
            const rayDir = { x: 1.0, y: 0.0 };
            const box = { minX: 8.0, maxX: 10.0, minY: 0.0, maxY: 2.0 };

            const res = checkRayAABBOverlap(rayOrigin, rayDir, 20.0, box);
            assert.equal(res.hit, true);
            assert.ok(Math.abs(res.distance - 8.0) < 1e-5);
            assert.ok(Math.abs(res.point.x - 8.0) < 1e-5);
            assert.ok(Math.abs(res.point.y - 1.5) < 1e-5);
        });

        it('returns miss when ray does not intersect box', () => {
            const rayOrigin = { x: 0.0, y: 5.0 };
            const rayDir = { x: 1.0, y: 0.0 };
            const box = { minX: 8.0, maxX: 10.0, minY: 0.0, maxY: 2.0 };

            const res = checkRayAABBOverlap(rayOrigin, rayDir, 20.0, box);
            assert.equal(res.hit, false);
        });
    });

    describe('2.5D Directional Knockback Engine', () => {
        it('projects knockback right with vertical pop when target is to the right', () => {
            const kb = calculateKnockback({ x: 0, y: 0 }, { x: 3, y: 0 }, 6.0);
            assert.equal(kb.vx, 6.0);
            assert.ok(Math.abs(kb.vy - 1.8) < 1e-5);
            assert.equal(kb.vz, 0.0);
        });

        it('projects knockback left when target is to the left', () => {
            const kb = calculateKnockback({ x: 5, y: 0 }, { x: 2, y: 0 }, 6.0);
            assert.equal(kb.vx, -6.0);
            assert.ok(Math.abs(kb.vy - 1.8) < 1e-5);
            assert.equal(kb.vz, 0.0);
        });

        it('resolves coincident center position using attacker facing direction', () => {
            // Facing +1
            const kbRight = calculateKnockback({ x: 4, y: 1 }, { x: 4, y: 1 }, 6.0, 1);
            assert.equal(kbRight.vx, 6.0);

            // Facing -1
            const kbLeft = calculateKnockback({ x: 4, y: 1 }, { x: 4, y: 1 }, 6.0, -1);
            assert.equal(kbLeft.vx, -6.0);
        });

        it('dampens knockback by target resistance and handles full immunity', () => {
            // 40% resistance
            const kbDamp = calculateKnockback({ x: 0, y: 0 }, { x: 3, y: 0 }, 6.0, 1, 0.4);
            assert.ok(Math.abs(kbDamp.vx - 3.6) < 1e-5);
            assert.ok(Math.abs(kbDamp.vy - 1.08) < 1e-5);

            // 100% resistance (boss hyper-armor)
            const kbImmune = calculateKnockback({ x: 0, y: 0 }, { x: 3, y: 0 }, 6.0, 1, 1.0);
            assert.equal(kbImmune.vx, 0.0);
            assert.equal(kbImmune.vy, 0.0);
        });
    });

    describe('Duplicate Hit Suppression (HitTracker)', () => {
        it('registers hit once, rejects duplicate hits in same swing, and resets cleanly', () => {
            const tracker = new HitTracker();
            const targetId = 'grunt_42';

            assert.equal(tracker.hasHit(targetId), false);
            assert.equal(tracker.registerHit(targetId), true, 'First hit must succeed');
            assert.equal(tracker.hasHit(targetId), true);
            assert.equal(tracker.registerHit(targetId), false, 'Duplicate hit must be suppressed');
            assert.equal(tracker.count, 1);

            // Register second target
            assert.equal(tracker.registerHit('grunt_43'), true);
            assert.equal(tracker.count, 2);

            // Reset for next swing
            tracker.reset();
            assert.equal(tracker.count, 0);
            assert.equal(tracker.hasHit(targetId), false);
            assert.equal(tracker.registerHit(targetId), true, 'Can hit again after reset');
        });

        it('auto-resets when swing ID changes using track(swingId, targetId)', () => {
            const tracker = new HitTracker();
            assert.equal(tracker.track('swing_1', 'dummy'), true);
            assert.equal(tracker.track('swing_1', 'dummy'), false);

            // Swing 2 starts -> auto clears previous hits
            assert.equal(tracker.track('swing_2', 'dummy'), true);
            assert.equal(tracker.count, 1);
        });
    });
});
