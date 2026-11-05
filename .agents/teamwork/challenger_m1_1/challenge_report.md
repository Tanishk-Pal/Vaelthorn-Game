# Challenge Report: Milestone 1 Verification (Kinematics & Hitbox Math Engine)

**Agent**: `challenger_m1_1` (Role: Empirical Challenger / Adversarial Verification Specialist)  
**Date**: 2026-11-01  
**Target Code**: `src/engine/kinematics.js`, `src/engine/hitbox.js`  
**Test Harness**: `E:\Vaelthorn\.agents\teamwork\challenger_m1_1\stress_kinematics_hitbox.js`  
**Verdict**: **`REQUEST_CHANGES`**

---

## Challenge Summary

**Overall risk assessment**: **CRITICAL**

An empirical adversarial test harness running 50,000+ total test iterations was executed against `src/engine/kinematics.js` and `src/engine/hitbox.js`. While horizontal locomotion, jump takeoff kinematics, Z=0 planar locking, and coincident-position knockback vectors demonstrated exceptional stability (0 crashes, 0 NaN leaks, 0 planar violations over 10,000 fuzzing cycles), a **CRITICAL game-breaking defect** was identified and empirically verified in `src/engine/kinematics.js`:

1. **Elevated Platform Tunneling**: 100% of falling entities tunnel completely through elevated platforms (`resolveGroundCollision()`) because swept step collision is checked *after* position integration with an inverted logic check (`entity.y >= p.y`).
2. **Unsanitized Inverted AABB Overlap**: Direct callers passing un-normalized AABB intervals ($minX > maxX$) trigger 41.4% false-positive collision rates in `check2DOverlap()`.
3. **Unenforced `maxDeltaTime`**: Timestep explosions are unmitigated because `DEFAULT_KINEMATICS_CONFIG.maxDeltaTime` is declared but never applied.

---

## Challenges

### [Critical] Challenge 1: Elevated Platform Tunneling in `resolveGroundCollision()`

- **Assumption challenged**: The docstring of `resolveGroundCollision()` claims: *"Resolves vertical collision with ground floor (y=0) and optional elevated platforms. Uses swept step collision to prevent high-velocity tunneling."*
- **Attack scenario**: An entity is falling toward an elevated platform ($p.y = 5.0, p.width = 6.0$) at terminal velocity ($v_y = -40\text{ m/s}$) with $dt = 0.016\text{s}$ (frame displacement $\Delta y = -0.64\text{m}$). Starting from $y = 5.2\text{m}$, the entity falls to $y = 4.56\text{m}$ in a single tick.
- **Observed Behavior**:
  - In `updateKinematics()` (`src/engine/kinematics.js`, lines 372–376):
    ```javascript
    entity.x += entity.vx * dt;
    entity.y += entity.vy * dt; // entity.y is now 4.56m (< 5.0m)
    resolveGroundCollision(entity, platforms, dt, config);
    ```
  - In `resolveGroundCollision()` (`src/engine/kinematics.js`, lines 230–235):
    ```javascript
    if (entity.x >= (p.x - halfW) && entity.x <= (p.x + halfW)) {
        if (entity.y >= p.y && (entity.y + entity.vy * dt) <= (p.y + 0.1)) {
            if (p.y > groundLevel) {
                groundLevel = p.y;
            }
        }
    }
    ```
  - Because `entity.y` was already updated to $4.56\text{m}$, `entity.y >= p.y` ($4.56 \ge 5.0$) evaluates to `false`.
  - Furthermore, `(entity.y + entity.vy * dt)` projects $4.56 - 0.64 = 3.92\text{m}$, double-counting the displacement!
  - `groundLevel` remains at $0.0$.
  - At line 243, `if (entity.y <= groundLevel)` ($4.56 \le 0.0$) is `false`, leaving `isGrounded = false`.
- **Empirical Stress Result**:
  - **5,000 out of 5,000 elevated platform trials tunneled through (100.00% failure rate).**
  - Entities can never land on an elevated platform unless $entity.y$ lands exactly on $p.y$ to within floating-point epsilon, and even then, on the subsequent frame `stickyGroundVelocity` (-2 m/s) pushes $y < p.y$, immediately dropping through.
- **Blast radius**: Elevated platforms across all levels/arenas are completely non-functional. Players and enemies fall through all platforms down to $y = 0.0$.
- **Mitigation**:
  - Store previous position prior to position integration:
    ```javascript
    const prevY = entity.y;
    entity.y += entity.vy * dt;
    // Check if vertical trajectory crossed platform top
    if (prevY >= p.y && entity.y <= p.y + 0.05) { ... }
    ```
  - Or perform swept collision check before updating `entity.y`.

---

### [High] Challenge 2: False-Positive Collisions in `check2DOverlap()` for Inverted Boxes

- **Assumption challenged**: `check2DOverlap(boxA, boxB)` expects valid bounding boxes, but does not enforce interval normalization.
- **Attack scenario**: A combat system caller or dynamic hitbox calculation produces an inverted bounding box ($minX > maxX$ or $minY > maxY$).
- **Observed Behavior**:
  - In `src/engine/hitbox.js`, lines 98–105:
    ```javascript
    const overlapX = inclusive
        ? (boxA.minX <= boxB.maxX && boxA.maxX >= boxB.minX)
        : (boxA.minX < boxB.maxX && boxA.maxX > boxB.minX);
    ```
  - If `boxA = { minX: 10, maxX: 0, minY: 10, maxY: 0 }` and `boxB = { minX: -5, maxX: 15, minY: -5, maxY: 15 }`:
    `boxA.minX <= boxB.maxX` ($10 \le 15$) is `true`.
    `boxA.maxX >= boxB.minX` ($0 \ge -5$) is `true`.
  - Returns `true` even though `boxA` represents an empty/invalid interval.
- **Empirical Stress Result**:
  - In 10,000 randomized trials comparing `check2DOverlap()` against an independent geometric oracle with normalized intervals, **4,140 false positives** were produced when un-normalized boxes were supplied.
  - (Note: When boxes are created via `createAABB()`, 0 mismatches occurred).
- **Blast radius**: Any dynamically constructed hitbox (e.g. projectile rays, reversed weapon swings, negative scaling) that bypasses `createAABB()` registers phantom hits across the entire arena.
- **Mitigation**:
  - Normalize intervals at entry of `check2DOverlap()`:
    ```javascript
    const aMinX = Math.min(boxA.minX, boxA.maxX);
    const aMaxX = Math.max(boxA.minX, boxA.maxX);
    ```
  - Or reject invalid boxes (`if (boxA.minX > boxA.maxX || boxA.minY > boxA.maxY) return false;`).

---

### [Medium] Challenge 3: Unenforced `maxDeltaTime` Timestep Clamp

- **Assumption challenged**: `DEFAULT_KINEMATICS_CONFIG.maxDeltaTime = 0.05` is intended to prevent simulation explosion during frame spikes.
- **Attack scenario**: Large delta time passed during browser tab switching or garbage collection pause ($dt = 2.0\text{s}$).
- **Observed Behavior**:
  - `updateKinematics()` checks `if (!Number.isFinite(dt) || dt <= 0.0) return entity;` but never clamps `dt` to `config.maxDeltaTime`.
  - An entity with $v_x = 9.0\text{ m/s}$ teleports $18\text{m}$ in a single frame, bypassing intermediate obstacles and triggers.
- **Blast radius**: Large frame hitch causes entities to phase through level boundaries or arena walls.
- **Mitigation**:
  - Add at the start of `updateKinematics()`:
    ```javascript
    const maxDt = config.maxDeltaTime ?? DEFAULT_KINEMATICS_CONFIG.maxDeltaTime ?? 0.05;
    const clampedDt = Math.min(dt, maxDt);
    ```

---

## Stress Test Results

| Test Suite | Scenario / Condition | Expected Behavior | Actual Behavior | Result |
|---|---|---|---|---|
| **Suite 1: Kinematics Fuzzing** | 10,000 iterations: NaNs, Infinities, extreme floats, dt <= 0, subnormal floats | 0 crashes, 0 NaN leaks, strict $Z=0$ plane | 0 crashes, 0 NaNs, 0 planar violations | **PASS** |
| **Suite 2A: Ground Floor Tunneling** | 5,000 iterations: Falling at terminal velocity ($-40\text{ m/s}$) onto ground ($y=0$) | Clamped to $y=0$, `isGrounded=true` | 0 tunnels past $y=0$ | **PASS** |
| **Suite 2B: Elevated Platform Tunneling** | 5,000 iterations: Falling at terminal velocity ($-40\text{ m/s}$) onto platform ($y=5$) | Land on platform at $y=5$, `isGrounded=true` | 5,000 tunnels through platform to $y=0$ (100% failure) | **FAIL (CRITICAL)** |
| **Suite 3: Rapid Input Flapping** | 10,000 iterations: Instant reversal, jump buffer spam, mid-air roll, simultaneous chords | Stable state transitions, no illegal states, no NaNs | 0 crashes, 0 NaNs, valid state invariants | **PASS** |
| **Suite 4A: Normalized AABB Overlap** | 10,000 iterations: Boxes constructed via `createAABB()` vs Mathematical Oracle | Exact match with oracle | 10,000 / 10,000 matches (0 mismatches) | **PASS** |
| **Suite 4B: Un-normalized AABB Overlap** | 10,000 iterations: Raw objects with inverted bounds ($min > max$) | False positives rejected | 4,140 false positive overlaps | **FAIL (HIGH RISK)** |
| **Suite 5: Knockback at $\Delta x = 0$** | 10,000 iterations: Coincident positions ($ax = tx$), extreme force, random facing | Finite vector, direction follows facing, $vz=0$ | 0 crashes, 0 NaNs, 0 direction errors, $vz=0$ | **PASS** |

---

## Unchallenged Areas

- Audio synthesis and rendering pipeline (scheduled for Milestone 4).
- High-level Boss AI multi-phase scripting (scheduled for Milestone 3).

---

## Conclusion & Verdict

**Verdict**: **`REQUEST_CHANGES`**

While the core numerical and vector operations in `kinematics.js` and `hitbox.js` are well guarded against float corruption and NaNs, the elevated platform collision logic in `resolveGroundCollision()` is fundamentally flawed due to post-integration execution with double-delta evaluation. This must be resolved before proceeding to Milestone 2.
