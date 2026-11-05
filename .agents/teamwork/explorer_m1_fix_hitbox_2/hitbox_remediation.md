# Remediation Specification: Hitbox & AABB Interval Normalization

**File**: `E:\Vaelthorn\.agents\teamwork\explorer_m1_fix_hitbox_2\hitbox_remediation.md`  
**Author**: `explorer_m1_fix_hitbox_2` (Hitbox Remediation Specialist)  
**Date**: 2026-11-01  
**Target Code**: `src/engine/hitbox.js` (and auxiliary `tests/unit/hitbox.test.js`, `tests/helpers/engine_loader.js`)  
**Defect Reference**: Challenger 1 Report (`challenger_m1_1/challenge_report.md` - Challenge 2)  

---

## 1. Executive Summary

Empirical stress testing conducted by `challenger_m1_1` identified that `check2DOverlap(boxA, boxB, inclusive)` in `src/engine/hitbox.js` fails with a **41.4% error rate (4,140 mismatches out of 10,000 trials)** when callers provide raw bounding box objects containing un-normalized intervals ($minX > maxX$ or $minY > maxY$).

While boxes constructed through the factory `createAABB()` are normalized at creation time, direct object literals produced by combat calculations (e.g., negative scaling, reversed directional swings, ray bounds) bypass factory validation. Under inverted coordinates, the classic 1D Separating Axis inequality ($min_A \le max_B \land max_A \ge min_B$) fails to model interval intersection, yielding false-positive and false-negative overlaps.

This document specifies the exact mathematical root cause, the necessary code remediation inside `check2DOverlap()` and `checkRayAABBOverlap()`, the complete code diff, and new unit test assertions for the implementing Worker.

---

## 2. Mathematical Root Cause Analysis

### 2.1 The Separating Axis Theorem on 1D Intervals
In 1D Euclidean space, two closed intervals $I_A = [a_{min}, a_{max}]$ and $I_B = [b_{min}, b_{max}]$ intersect if and only if:
$$\max(a_{min}, b_{min}) \le \min(a_{max}, b_{max})$$
Assuming standard normalization ($a_{min} \le a_{max}$ and $b_{min} \le b_{max}$), this is equivalent to:
$$a_{min} \le b_{max} \quad \land \quad a_{max} \ge b_{min}$$

### 2.2 The Inversion Breakdown
When a caller supplies an un-normalized interval where $min > max$ (for example, $I_A$ with $a_{min} = 10, a_{max} = 0$):
1. **False Positive Failure Mode**:
   Suppose $I_B = [-5, 15]$.
   - $a_{min} \le b_{max} \implies 10 \le 15$ (Evaluates `true`)
   - $a_{max} \ge b_{min} \implies 0 \ge -5$ (Evaluates `true`)
   - The function returns `true`.
   However, if $I_A$ was intended as an empty/invalid interval, or if $I_B = [2, 8]$:
   - $a_{min} \le b_{max} \implies 10 \le 8$ (Evaluates `false`)
   - Even though the span $[0, 10]$ clearly encloses $[2, 8]$, the un-normalized comparison evaluates `false`!
2. **Empirical Evidence**:
   In `stress_kinematics_hitbox.js` Suite 4B, 10,000 randomized trials evaluated un-normalized boxes against a normalized geometric oracle:
   - Normalized boxes (`createAABB()`): 0 mismatches / 10,000 trials.
   - Raw inverted boxes: **4,140 mismatches / 10,000 trials (41.40% failure rate)**.

### 2.3 Secondary Vulnerability: `checkRayAABBOverlap()`
In `checkRayAABBOverlap()` (`src/engine/hitbox.js`, lines 252–270), parallel ray checks test:
```javascript
if (ox < box.minX || ox > box.maxX) return { hit: false, ... };
```
If `box.minX > box.maxX` (e.g., $minX = 10, maxX = 8$), then for any $ox \in \mathbb{R}$, either $ox < 10$ or $ox > 8$ is always `true`. Consequently, a ray parallel to an axis ($dx = 0$ or $dy = 0$) will *always* report a miss, even when passing directly through the box's spatial volume.

---

## 3. Remediation Design

### 3.1 Primary Fix: In-Place Interval Normalization in `check2DOverlap()`
Inside `check2DOverlap()`, normalize $X$ and $Y$ boundaries immediately upon entry using `Math.min` and `Math.max`. If $Z$ boundaries are supplied, normalize those as well.

```javascript
function check2DOverlap(boxA, boxB, inclusive = true) {
    if (!boxA || !boxB) return false;

    // 1. Normalize X and Y intervals to guarantee min <= max
    const aMinX = Math.min(boxA.minX, boxA.maxX);
    const aMaxX = Math.max(boxA.minX, boxA.maxX);
    const aMinY = Math.min(boxA.minY, boxA.maxY);
    const aMaxY = Math.max(boxA.minY, boxA.maxY);

    const bMinX = Math.min(boxB.minX, boxB.maxX);
    const bMaxX = Math.max(boxB.minX, boxB.maxX);
    const bMinY = Math.min(boxB.minY, boxB.maxY);
    const bMaxY = Math.max(boxB.minY, boxB.maxY);

    // 2. Evaluate 2D axis overlap using normalized bounds
    const overlapX = inclusive
        ? (aMinX <= bMaxX && aMaxX >= bMinX)
        : (aMinX < bMaxX && aMaxX > bMinX);

    const overlapY = inclusive
        ? (aMinY <= bMaxY && aMaxY >= bMinY)
        : (aMinY < bMaxY && aMaxY > bMinY);

    if (!overlapX || !overlapY) return false;

    // 3. Optional Z depth alignment check with normalized bounds
    if (boxA.minZ !== undefined && boxA.maxZ !== undefined &&
        boxB.minZ !== undefined && boxB.maxZ !== undefined) {
        const aMinZ = Math.min(boxA.minZ, boxA.maxZ);
        const aMaxZ = Math.max(boxA.minZ, boxA.maxZ);
        const bMinZ = Math.min(boxB.minZ, boxB.maxZ);
        const bMaxZ = Math.max(boxB.minZ, boxB.maxZ);

        const overlapZ = inclusive
            ? (aMinZ <= bMaxZ && aMaxZ >= bMinZ)
            : (aMinZ < bMaxZ && aMaxZ > bMinZ);
        if (!overlapZ) return false;
    }

    return true;
}
```

**Properties of this fix**:
- **Zero Allocations**: Avoids object instantiations (`createAABB`), keeping CPU cache and GC pressure at zero during hot-path 60Hz collision detection.
- **NaN Defense**: If any coordinate is `undefined` or `NaN`, `Math.min`/`Math.max` returns `NaN`. Comparisons with `NaN` evaluate to `false`, safely rejecting invalid bounding boxes without runtime crashes.
- **Exhaustive Symmetry**: Protects against $A$ inverted, $B$ inverted, or both inverted across $X$, $Y$, and $Z$ axes.

### 3.2 Secondary Fix: Normalize Box in `checkRayAABBOverlap()`
In `checkRayAABBOverlap()` (`src/engine/hitbox.js`, line 244):
```javascript
    if (!box) {
        return { hit: false, distance: 0, point: { x: ox, y: oy, z: 0 } };
    }

    const bMinX = Math.min(box.minX, box.maxX);
    const bMaxX = Math.max(box.minX, box.maxX);
    const bMinY = Math.min(box.minY, box.maxY);
    const bMaxY = Math.max(box.minY, box.maxY);
```
Use `bMinX, bMaxX, bMinY, bMaxY` instead of `box.minX, box.maxX, box.minY, box.maxY` throughout the slab method.

### 3.3 Tertiary Fix: Defensive Bounds in `computeSwordHitbox()`
In `computeSwordHitbox()` (`src/engine/hitbox.js`, line 163):
```javascript
    const minX = facing > 0 ? x : x - r;
    const maxX = facing > 0 ? x + r : x;
    const minY = y - 0.2;
    const maxY = y + h;
    return {
        minX: Math.min(minX, maxX),
        maxX: Math.max(minX, maxX),
        minY: Math.min(minY, maxY),
        maxY: Math.max(minY, maxY),
        minZ: 0.0,
        maxZ: 0.0
    };
```
Guarantees that sword hitboxes generated with negative reach or negative height are automatically normalized.

---

## 4. Exact Code Patch (for Worker)

### Target File: `src/engine/hitbox.js`

```diff
--- a/src/engine/hitbox.js
+++ b/src/engine/hitbox.js
@@ -95,13 +95,22 @@
 function check2DOverlap(boxA, boxB, inclusive = true) {
     if (!boxA || !boxB) return false;
 
+    const aMinX = Math.min(boxA.minX, boxA.maxX);
+    const aMaxX = Math.max(boxA.minX, boxA.maxX);
+    const aMinY = Math.min(boxA.minY, boxA.maxY);
+    const aMaxY = Math.max(boxA.minY, boxA.maxY);
+
+    const bMinX = Math.min(boxB.minX, boxB.maxX);
+    const bMaxX = Math.max(boxB.minX, boxB.maxX);
+    const bMinY = Math.min(boxB.minY, boxB.maxY);
+    const bMaxY = Math.max(boxB.minY, boxB.maxY);
+
     const overlapX = inclusive
-        ? (boxA.minX <= boxB.maxX && boxA.maxX >= boxB.minX)
-        : (boxA.minX < boxB.maxX && boxA.maxX > boxB.minX);
+        ? (aMinX <= bMaxX && aMaxX >= bMinX)
+        : (aMinX < bMaxX && aMaxX > bMinX);
 
     const overlapY = inclusive
-        ? (boxA.minY <= boxB.maxY && boxA.maxY >= boxB.minY)
-        : (boxA.minY < boxB.maxY && boxA.maxY > boxB.minY);
+        ? (aMinY <= bMaxY && aMaxY >= bMinY)
+        : (aMinY < bMaxY && aMaxY > bMinY);
 
     if (!overlapX || !overlapY) return false;
 
@@ -109,8 +118,13 @@
     if (boxA.minZ !== undefined && boxA.maxZ !== undefined &&
         boxB.minZ !== undefined && boxB.maxZ !== undefined) {
+        const aMinZ = Math.min(boxA.minZ, boxA.maxZ);
+        const aMaxZ = Math.max(boxA.minZ, boxA.maxZ);
+        const bMinZ = Math.min(boxB.minZ, boxB.maxZ);
+        const bMaxZ = Math.max(boxB.minZ, boxB.maxZ);
+
         const overlapZ = inclusive
-            ? (boxA.minZ <= boxB.maxZ && boxA.maxZ >= boxB.minZ)
-            : (boxA.minZ < boxB.maxZ && boxA.maxZ > boxB.minZ);
+            ? (aMinZ <= bMaxZ && aMaxZ >= bMinZ)
+            : (aMinZ < bMaxZ && aMaxZ > bMinZ);
         if (!overlapZ) return false;
     }
 
@@ -163,8 +177,10 @@
     const minX = facing > 0 ? x : x - r;
     const maxX = facing > 0 ? x + r : x;
+    const minY = y - 0.2;
+    const maxY = y + h;
     return {
-        minX,
-        maxX,
-        minY: y - 0.2,
-        maxY: y + h,
+        minX: Math.min(minX, maxX),
+        maxX: Math.max(minX, maxX),
+        minY: Math.min(minY, maxY),
+        maxY: Math.max(minY, maxY),
         minZ: 0.0,
         maxZ: 0.0
     };
@@ -244,14 +260,19 @@
     if (!box) {
         return { hit: false, distance: 0, point: { x: ox, y: oy, z: 0 } };
     }
 
+    const bMinX = Math.min(box.minX, box.maxX);
+    const bMaxX = Math.max(box.minX, box.maxX);
+    const bMinY = Math.min(box.minY, box.maxY);
+    const bMaxY = Math.max(box.minY, box.maxY);
+
     let tMinX = -Infinity;
     let tMaxX = Infinity;
 
     if (Math.abs(dx) > 1e-7) {
-        const tx1 = (box.minX - ox) / dx;
-        const tx2 = (box.maxX - ox) / dx;
+        const tx1 = (bMinX - ox) / dx;
+        const tx2 = (bMaxX - ox) / dx;
         tMinX = Math.min(tx1, tx2);
         tMaxX = Math.max(tx1, tx2);
     } else {
-        if (ox < box.minX || ox > box.maxX) {
+        if (ox < bMinX || ox > bMaxX) {
             return { hit: false, distance: 0, point: { x: ox, y: oy, z: 0 } };
         }
     }
 
     let tMinY = -Infinity;
     let tMaxY = Infinity;
 
     if (Math.abs(dy) > 1e-7) {
-        const ty1 = (box.minY - oy) / dy;
-        const ty2 = (box.maxY - oy) / dy;
+        const ty1 = (bMinY - oy) / dy;
+        const ty2 = (bMaxY - oy) / dy;
         tMinY = Math.min(ty1, ty2);
         tMaxY = Math.max(ty1, ty2);
     } else {
-        if (oy < box.minY || oy > box.maxY) {
+        if (oy < bMinY || oy > bMaxY) {
             return { hit: false, distance: 0, point: { x: ox, y: oy, z: 0 } };
         }
     }
```

---

## 5. Unit Test Suite Assertions (for `tests/unit/hitbox.test.js`)

The Worker must add the following test cases to `tests/unit/hitbox.test.js` under `describe('AABB Construction & 2D Overlap Theorem', ...)`:

```javascript
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
```

---

## 6. Verification and Validation Procedure

1. **Unit Test Verification**:
   ```powershell
   node --test E:\Vaelthorn\tests\unit\hitbox.test.js
   ```
   **Expected**: 21 passed (19 existing + 2 new), 0 failed.

2. **Full Adversarial Fuzzing & Oracle Validation**:
   ```powershell
   node E:\Vaelthorn\.agents\teamwork\challenger_m1_1\stress_kinematics_hitbox.js
   ```
   **Expected**:
   - `Normalized Box Mismatches: 0`
   - `Raw Inverted Box Mismatches: 0` (down from 4,140)
   - Zero crashes and zero NaN leaks.
