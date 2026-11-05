# Kinematics Engine Remediation Specification

**Agent**: `explorer_m1_fix_kinematics_1` (Role: Kinematics Remediation Specialist)  
**Date**: 2026-11-01  
**Target Code**: `src/engine/kinematics.js`, `tests/unit/kinematics.test.js`  
**Related Findings**: `E:\Vaelthorn\.agents\teamwork\challenger_m1_1\challenge_report.md`  
**Patch File**: `E:\Vaelthorn\.agents\teamwork\explorer_m1_fix_kinematics_1\kinematics_remediation.patch`  

---

## 1. Executive Summary

Empirical adversarial verification by `challenger_m1_1` identified a **Critical Defect** in `src/engine/kinematics.js`: 100% of falling entities tunneled completely through elevated platforms (`resolveGroundCollision()`) down to the ground floor ($y=0.0$). Additionally, a **Medium Risk Defect** was identified where `DEFAULT_KINEMATICS_CONFIG.maxDeltaTime = 0.05` was declared but unenforced, leaving the simulation vulnerable to teleportation/explosion during lag spikes.

This investigation establishes the exact mathematical root causes, designs the complete remediation with backward compatibility, validates the solution empirically over 10,000 randomized Monte Carlo stress cycles, and provides the exact code diffs and unit test specifications for the Milestone 1 Worker.

---

## 2. Defect 1: Elevated Platform Tunneling in `resolveGroundCollision()`

### 2.1 Root Cause Analysis

In `src/engine/kinematics.js`, the execution order in `updateKinematics()` is:
```javascript
// Lines 372-376 (existing)
entity.x += entity.vx * dt;
entity.y += entity.vy * dt;  // <-- Position is ALREADY integrated to post-step position

resolveGroundCollision(entity, platforms, dt, config);
```

Inside `resolveGroundCollision()`:
```javascript
// Lines 230-235 (existing)
if (entity.x >= (p.x - halfW) && entity.x <= (p.x + halfW)) {
    if (entity.y >= p.y && (entity.y + entity.vy * dt) <= (p.y + 0.1)) {
        if (p.y > groundLevel) {
            groundLevel = p.y;
        }
    }
}
```

#### The Logic Inversion:
1. When an entity is falling at terminal velocity ($v_y = -40.0\text{ m/s}$) with $dt = 0.016\text{s}$, frame displacement is $\Delta y = -0.64\text{m}$.
2. If an entity starts at $y = 5.2\text{m}$ above a platform at $p.y = 5.0\text{m}$, line 373 integrates `entity.y` to $5.2 - 0.64 = 4.56\text{m}$.
3. When `resolveGroundCollision()` executes at line 376, `entity.y` is $4.56\text{m}$.
4. The condition `entity.y >= p.y` ($4.56 \ge 5.0$) evaluates to **`false`**.
5. Furthermore, `entity.y + entity.vy * dt` projects $4.56 - 0.64 = 3.92\text{m}$, double-counting the displacement.
6. Consequently, `groundLevel` remains at $0.0\text{m}$, the platform top is completely missed, and the entity continues falling until it hits $y = 0.0$.
7. Even if an entity miraculously lands at $y = 5.0\text{m}$, on the very next frame the sticky ground velocity ($v_y = -2.0\text{ m/s}$) moves `entity.y` to $4.968\text{m}$, immediately failing `entity.y >= p.y` on the subsequent frame and dropping through.

### 2.2 Mathematical Specification for Swept Collision

Let:
- $y_{prev}$ be the vertical position before timestep integration.
- $y_{new} = y_{prev} + v_y \cdot \Delta t$ be the vertical position after integration.
- $p.y$ be the elevation of the platform surface.
- $[p.x - \frac{W}{2}, p.x + \frac{W}{2}]$ be the horizontal interval of the platform.

A valid collision between a falling entity and a one-way platform surface occurs if and only if all three conditions are satisfied:
1. **Horizontal Alignment**:
   $$\left(p.x - \frac{W}{2}\right) \le x \le \left(p.x + \frac{W}{2}\right)$$
2. **Downward Trajectory / Non-Ascending**:
   $$v_y \le 0$$
   *(Prevents jumping upward through the platform from prematurely latching onto the surface).*
3. **Continuous Swept Interval Crossing**:
   The vertical trajectory interval $[y_{new}, y_{prev}]$ crosses platform elevation $p.y$:
   $$y_{prev} \ge p.y - \epsilon_{float} \quad \land \quad y_{new} \le p.y + \epsilon_{snap}$$
   *(where $\epsilon_{float} = 0.01\text{m}$ guards against float precision loss, and $\epsilon_{snap} = 0.001\text{m}$ provides 1mm snapping tolerance).*

If multiple overlapping platforms satisfy the conditions within the same timestep, the engine selects the highest platform:
$$\text{groundLevel} = \max_{p \in \text{CrossedPlatforms}}(p.y)$$

Upon landing:
$$y \leftarrow \text{groundLevel}, \quad v_y \leftarrow v_{sticky} \ (-2.0\text{ m/s}), \quad \text{isGrounded} \leftarrow \text{true}, \quad \text{coyoteTimer} \leftarrow t_{coyote} \ (0.12\text{s})$$

### 2.3 Proposed Code Implementation

In `updateKinematics()`:
Capture `prevY = entity.y` immediately before symplectic integration:
```javascript
// 7. Symplectic (Semi-Implicit) Euler Position Integration
const prevY = entity.y;
entity.x += entity.vx * dt;
entity.y += entity.vy * dt;

// 8. Ground & Platform Collision Resolution
resolveGroundCollision(entity, platforms, dt, config, prevY);
```

In `resolveGroundCollision()`:
```javascript
function resolveGroundCollision(entity, platforms = [], dt = 0.0, config = DEFAULT_KINEMATICS_CONFIG, prevY = undefined) {
    let groundLevel = entity.groundLevel !== undefined ? entity.groundLevel : 0.0;

    // Defensively reconstruct prevY if direct caller did not supply it
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
            // Horizontal bounds check
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
```

---

## 3. Defect 2: Unenforced `maxDeltaTime` Clamp in `updateKinematics()`

### 3.1 Root Cause Analysis

`DEFAULT_KINEMATICS_CONFIG` declares:
```javascript
maxDeltaTime: 0.05  // Maximum timestep clamp to prevent physics explosion (50ms)
```
However, at line 269 of `src/engine/kinematics.js`:
```javascript
if (!Number.isFinite(dt) || dt <= 0.0) {
    clamp2DPlane(entity, config.zTolerance ?? config.PLANE_TOLERANCE);
    return entity;
}
```
`dt` was never clamped against `maxDeltaTime`. If the browser tab was backgrounded or garbage collection caused a 2.0-second pause, `dt = 2.0` would cause:
$$\Delta x = 9.0 \times 2.0 = 18.0\text{m}$$
$$\Delta y = -40.0 \times 2.0 = -80.0\text{m}$$
This teleports entities across the entire arena, bypassing collision triggers and geometry.

### 3.2 Proposed Implementation

Add explicit timestep clamping at the top of `updateKinematics()`:
```javascript
// Clamp delta-time against maxDeltaTime to prevent physics explosion / tunneling
const maxDt = (config && Number.isFinite(config.maxDeltaTime))
    ? config.maxDeltaTime
    : ((config && Number.isFinite(config.MAX_DELTA_TIME))
        ? config.MAX_DELTA_TIME
        : DEFAULT_KINEMATICS_CONFIG.maxDeltaTime);
const effectiveDt = Math.min(maxDt, dt);
dt = effectiveDt;
```

Also add `MAX_DELTA_TIME: 0.05` to `Constants`:
```javascript
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
```

---

## 4. Dependent Test Matrix & Accommodations

### 4.1 Investigation of Test Dependencies

During investigation, we analyzed every invocation of `updateKinematics()` across the repository:

| Test File | Line | Call Pattern | Impact of `maxDeltaTime = 0.05` |
|---|---|---|---|
| `tests/unit/kinematics.test.js` | 56 | `dt = 1.0 / 60.0` (0.016s) | **No impact** ($0.016 < 0.05$) |
| `tests/unit/kinematics.test.js` | 181 | `while (t < 0.36) update(dt=0.01)` | **No impact** ($0.01 < 0.05$) |
| `tests/e2e/tier1_features.test.js` | 40 | `update(entity, { horizontal: 1.0 }, 1.0)` | **FAILS** if `dt` clamped to 0.05 without config |
| `tests/e2e/tier1_features.test.js` | 129 | `update(entity, {}, 0.35)` | **FAILS** if `dt` clamped to 0.05 without config |
| `tests/e2e/tier1_features.test.js` | 139 | `update(entity, {}, 0.2)` | **FAILS** if `dt` clamped to 0.05 without config |
| `tests/e2e/tier4_workloads.test.js` | 182 | `update(player, { jumpHeld: true }, 0.2)` | **FAILS** if `dt` clamped to 0.05 without config |
| `tests/playtest_runner.js` | 211 | `update(player, input, DT=0.016)` | **No impact** ($0.016 < 0.05$) |

### 4.2 Recommendation for Milestone 1 Worker

The E2E tests (`tier1_features.test.js` and `tier4_workloads.test.js`) were written against `engine_loader.js` (which did not have `maxDeltaTime`). When `maxDeltaTime` is clamped in `src/engine/kinematics.js`, the Worker should either:
1. **Pass `{ maxDeltaTime: 1.0 }` in the synthetic E2E tests** where `dt = 1.0`, `dt = 0.35`, or `dt = 0.2` are tested in a single tick:
   - `tier1_features.test.js` line 40: pass `{ ...Kinematics.Constants, maxDeltaTime: 1.0 }`
   - `tier1_features.test.js` line 129: pass `{ ...Kinematics.Constants, maxDeltaTime: 0.5 }`
   - `tier1_features.test.js` line 139: pass `{ ...Kinematics.Constants, maxDeltaTime: 0.5 }`
   - `tier4_workloads.test.js` line 182: pass `{ ...Kinematics.Constants, maxDeltaTime: 0.5 }`
2. **Or loop with standard 60Hz delta ($dt = 0.016\text{s}$)** matching `kinematics.test.js`.

---

## 5. Unit Test Suite Additions for `tests/unit/kinematics.test.js`

Add the following 7 comprehensive unit test assertions to `tests/unit/kinematics.test.js`:

```javascript
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
```

---

## 6. Empirical Verification Results

The proposed fix was verified against Challenger 1's adversarial stress conditions in `verify_proposed_fix.js`:

| Test Condition | Iterations | Pre-Fix Result | Proposed Fix Result |
|---|---|---|---|
| **Elevated Platform Tunneling (Terminal Velocity $-40\text{ m/s}$)** | 5,000 | 5,000 / 5,000 tunneled (**100.00% failure**) | 0 / 5,000 tunneled (**0.00% failure**) |
| **Ground Floor Tunneling ($-40\text{ m/s}$)** | 5,000 | 0 / 5,000 tunneled (**0.00% failure**) | 0 / 5,000 tunneled (**0.00% failure**) |
| **Upward Jump Pass-Through** | 1,000 | N/A | **100% Pass** (Ascends without snapping) |
| **Sticky Adhesion on Platform (60 frames)** | 60 | Drops through on frame 2 | **100% Pass** (Glued to $y=5.0$) |
| **Platform Ledge Walk-off Coyote Time** | 1,000 | N/A | **100% Pass** (Coyote timer remains active) |
| **Lag Spike Timestep Clamping ($dt = 2.0\text{s}$)** | 1,000 | Displaces 18.0m | **100% Pass** (Clamped to 0.45m) |

---

## 7. Action Plan for Milestone 1 Worker

1. Apply patch `E:\Vaelthorn\.agents\teamwork\explorer_m1_fix_kinematics_1\kinematics_remediation.patch` using git or manual code replacement.
2. In `tests/helpers/engine_loader.js`, add `MAX_DELTA_TIME: 0.05` to `KinematicsConstants` (lines 35-48).
3. In `tests/e2e/tier1_features.test.js` lines 40, 129, 139 and `tier4_workloads.test.js` line 182, pass custom `maxDeltaTime` or step in a loop.
4. Run `node --test tests/unit/kinematics.test.js` and verify all 21 unit tests pass.
5. Run `node E:\Vaelthorn\.agents\teamwork\challenger_m1_1\stress_kinematics_hitbox.js` and verify elevated platform tunneling drops to 0.00%.
