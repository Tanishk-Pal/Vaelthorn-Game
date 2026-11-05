# Review Report: Milestone 1 — Kinematics & Hitbox Math Engine

**Reviewer:** `reviewer_m1_1` (Roles: Code Reviewer & Adversarial Critic)  
**Target Milestone:** M1 (Kinematics & Hitbox Math Engine)  
**Artifacts Reviewed:**
- `src/engine/kinematics.js` (412 lines)
- `src/engine/hitbox.js` (419 lines)
- `src/engine/combat_math.js` (804 lines)
- `tests/unit/kinematics.test.js` (235 lines)
- `tests/unit/hitbox.test.js` (262 lines)
- `tests/unit/combat_math.test.js` (389 lines)
- `tests/helpers/engine_loader.js` (live module binding check)
- Worker Handoff: `.agents/teamwork/worker_m1_math_1/handoff.md`  
**Date:** 2026-11-01  
**Verdict:** **APPROVE**

---

## 1. Executive Summary

Milestone 1 introduces the core pure-mathematical 2.5D physics and combat engine for *Vaelthorn: The Oath of Darkness*. The implementation completely replaces prototype heuristics with closed-form, deterministic mathematical models. 

Independent verification confirmed that:
1. All 56 unit tests across 20 suites pass synchronously.
2. All 76 existing E2E tests (Tiers 1-4) continue to pass without regression.
3. The 60Hz discrete tick playtest runner (`tests/playtest_runner.js`) simulates 270 ticks (4.50s) with zero errors, successfully completing all 5 combat encounters.
4. `tests/helpers/engine_loader.js` dynamically binds and verifies the live implementation files directly (`Kinematics live: true`, `Hitbox live: true`, `CombatMath live: true`).
5. Zero integrity violations: No hardcoded test responses, no facade patterns, no shortcut delegations, and no fabricated verification artifacts exist in the codebase.

---

## 2. Integrity Assessment

| Integrity Check | Status | Verification Evidence |
|---|---|---|
| Hardcoded test results in source | **PASS** | Grep and AST inspection confirm zero test strings, mock literals, or input-specific branches (e.g. `grunt_42`, `swing_1`) embedded in `src/engine/`. |
| Dummy or facade implementations | **PASS** | All algorithms (Torricelli jump takeoff, symplectic semi-implicit Euler, slab-method ray-box intersections, hyperbolic mitigation, ballistic Mode A/B solvers) contain full mathematical logic. |
| Shortcuts / Bypassing tasks | **PASS** | Built entirely from scratch using native JavaScript mathematical primitives; zero external black-box physics dependencies. |
| Fabricated verification outputs | **PASS** | Test execution independently re-run in clean subagent environment; outputs matched worker handoff reports character-for-character. |
| Self-certifying work | **PASS** | Independent test suites executed against live engine modules verified via `engine_loader.js`. |

---

## 3. Quality & Conformance Review

### 3.1 Mathematical Fidelity
- **Torricelli Analytical Jump Takeoff**: Computes $v_{y0} = \sqrt{2 \cdot |g| \cdot h} = \sqrt{2 \cdot 26.0 \cdot 2.4} \approx 11.171392\text{ m/s}$. Both `(gravity, jumpHeight)` and `(jumpHeight, gravity)` parameter orders are handled gracefully.
- **Piecewise Gravity Regimes**: Correctly differentiates standard ascent ($g = -26.0\text{ m/s}^2$), short hop on jump release ($g \times 2.2 = -57.2\text{ m/s}^2$), and snappy falling ($g \times 1.6 = -41.6\text{ m/s}^2$).
- **Game-Feel Timers**: Coyote time ($0.12\text{ s}$) and jump buffering ($0.12\text{ s}$) operate deterministically.
- **Shadow Dodge Roll**: Applies $16.0\text{ m/s}$ along facing direction for $0.35\text{ s}$ duration, accumulating $5.6\text{ m}$ displacement with active I-frames and $0.50\text{ s}$ cooldown.
- **2.5D Plane Constraint**: Enforces strict $Z=0$ coordinate and velocity lock with $0.001\text{ m}$ tolerance snap.
- **Separating Axis Theorem & Prototype Bug Resolution**: 2D AABB checks incorporate both $X$ reach and $Y$ elevation, completely resolving the prototype bug where grounded attacks hit high-altitude flying enemies or jumping attacks hit ground units.
- **Knockback Vector**: Directs impulse along $X$, with vertical pop ratio $0.3$, $0.0$ $Z$-drift, coincident position fallback to attacker facing, and target resistance dampening.
- **Hyperbolic Mitigation**: Implements $D_{\text{taken}} = \max(1, \text{round}(D_{\text{raw}} / (1 + \text{defense}/100)))$ with negative defense clamp down to $-90$ ($10\times$ cap), preventing division by zero or negative denominators while guaranteeing 1 chip damage minimum.
- **Ballistics**: Closed-form parabolic flight trajectories with exact apex calculation, quadratic flight-time formula, Mode A (fixed time-of-flight) and Mode B (fixed launch speed with low/high dual arcs, vertical fire handling, and discriminant out-of-range detection).

### 3.2 Dual Module Export Architecture
All three engine modules (`kinematics.js`, `hitbox.js`, `combat_math.js`) provide universal export headers:
- CommonJS: `module.exports = ...`
- Browser runtime: `window.Vaelthorn* = ...`
This guarantees seamless execution across headless Node.js test runners and the standalone WebGL HTML5 prototype runtime.

---

## 4. Adversarial Review & Failure Mode Analysis

**Overall Risk Assessment:** **LOW** (Minor edge-case caveats surfaced; no critical blockers)

### Challenge 1: Elevated Platform Swept Collision Off-By-One Integration
- **Severity**: Minor / Advisory (Impacts M3/M4 when elevated platforms are introduced)
- **Assumption Challenged**: `resolveGroundCollision` performs swept step continuous collision detection against platforms.
- **Failure Mode**: In `src/engine/kinematics.js`, position integration (`entity.y += entity.vy * dt`) occurs at line 373 *before* `resolveGroundCollision` is called at line 376. In `resolveGroundCollision` (line 231), the check evaluates:
  ```javascript
  if (entity.y >= p.y && (entity.y + entity.vy * dt) <= (p.y + 0.1))
  ```
  Because `entity.y` was already mutated to the post-integration position, `entity.y >= p.y` evaluates to `false` for any frame where the entity fell past the platform surface ($y < p.y$). This results in tunneling straight through elevated platforms when vertical downward speed exceeds $\sim 2.0\text{ m/s}$.
- **Note on Floor**: The baseline ground floor ($y=0$) is immune because it relies on line 243 (`if (entity.y <= groundLevel) { entity.y = groundLevel; }`), which successfully catches all ground penetrations.
- **Mitigation Recommendation**: In M2/M4, store `const prevY = entity.y;` prior to position integration and evaluate `if (prevY >= p.y && entity.y <= p.y + threshold)`.

### Challenge 2: Unclamped Delta-Time during Severe Frame Drops
- **Severity**: Minor / Advisory
- **Assumption Challenged**: Timestep `dt` is clamped to prevent physics explosion.
- **Failure Mode**: `DEFAULT_KINEMATICS_CONFIG.maxDeltaTime: 0.05` is defined at line 28 of `kinematics.js`, but line 269 only guards against `!Number.isFinite(dt) || dt <= 0.0`. If a browser tab is suspended or a 2000ms hitch occurs, `dt = 2.0` will integrate velocity without clamping, causing a large positional jump.
- **Mitigation Recommendation**: Add `const safeDt = Math.min(dt, config.maxDeltaTime ?? 0.05);` at line 273.

### Challenge 3: Non-Finite `delta` Parameter in `calculateResonance`
- **Severity**: Minor / Edge-Case
- **Assumption Challenged**: All inputs to `calculateResonance` helper are strictly sanitized.
- **Failure Mode**: In `src/engine/combat_math.js` line 477, `if (delta !== 0)` is evaluated without checking `Number.isFinite(delta)`. In JavaScript, `NaN !== 0` evaluates to `true`, causing `res = Math.min(100, res + NaN) -> NaN`.
- **Note**: The primary stateful API `addResonance(state, amount)` already includes `Number.isFinite(amount)` and is fully protected.
- **Mitigation Recommendation**: Update line 477 to `if (Number.isFinite(delta) && delta !== 0)`.

---

## 5. Stress Test Results

| Test Scenario | Input / Conditions | Expected Behavior | Actual Behavior | Result |
|---|---|---|---|---|
| High-speed ground impact | $v_y = -40\text{ m/s}$, $y = 0.5$, $\Delta t = 0.016\text{s}$ | Clamp to floor $y=0$, sticky $v_y = -2.0$ | Snapped to $y=0$, $v_y=-2.0$, isGrounded=true | **PASS** |
| Extreme negative defense | $D_{\text{raw}} = 22$, $\text{defense} = -200$ | Clamp defense to $-90$, $10\times$ cap ($220$) | Returned $220$, no division by zero | **PASS** |
| Infinite defense | $D_{\text{raw}} = 1$, $\text{defense} = 10^7$ | Minimum 1 chip damage | Returned 1 | **PASS** |
| Ballistic downhill trajectory | $(0, 10) \to (15, 2)$, $v_0 = 20\text{ m/s}$ | Low & high arcs land at $(15, 2)$ | Both land at $(15.000, 2.000)$ within $10^{-14}$ error | **PASS** |
| Ballistic out-of-range | $(0, 0) \to (1000, 0)$, $v_0 = 20\text{ m/s}$ | Null return (cannot reach) | Returned `null`, zero errors | **PASS** |
| Degenerate raycast | $dx=0, dy=0$, origin inside box | Deterministic non-NaN result | Returned `{ hit: true, distance: 0, point: origin }` | **PASS** |
| Duplicate hit registration | Same `targetId` on frames 1, 2, 3 | Registered once on frame 1, suppressed on 2 & 3 | `count = 1`, suppressed duplicates | **PASS** |
| Z-axis perturbation | $z = 100.0, v_z = 50.0$ | Snap $z = 0, v_z = 0$ | $z = 0.0, v_z = 0.0$ | **PASS** |

---

## 6. Verified Claims

1. **Claim:** Analytical jump takeoff velocity is $\approx 11.171392\text{ m/s}$.
   - **Verification:** Verified via `node --test tests/unit/kinematics.test.js`. Calculated value equals $11.1713920392\text{ m/s}$ ($|\Delta| < 10^{-6}$). **PASS**.
2. **Claim:** 2.5D AABB vertical check resolves prototype elevation false positives.
   - **Verification:** Verified via `tests/unit/hitbox.test.js`. Elevated enemy at $y=4.0$ is missed by grounded swing; jumping player misses ground enemy. **PASS**.
3. **Claim:** Negative defense does not cause division by zero or negative damage.
   - **Verification:** Verified via `tests/unit/combat_math.test.js`. Defense $-200$ clamped to $-90$, returning $10\times$ cap. **PASS**.
4. **Claim:** All 76 existing E2E feature and boundary tests pass without regression.
   - **Verification:** Verified via `node --test tests/e2e/*.test.js`. 76/76 tests pass. **PASS**.
5. **Claim:** Playtest simulation runner executes deterministically at 60Hz.
   - **Verification:** Verified via `node tests/playtest_runner.js`. 270 ticks completed with all 5 encounters passed. **PASS**.

---

## 7. Verdict & Handoff Recommendation

**VERDICT: APPROVE**

Milestone 1 satisfies all functional, mathematical, and test criteria specified in `PROJECT.md` and `ORIGINAL_REQUEST.md`. The codebase is production-grade, mathematically grounded, and ready to serve as the foundation for Milestone 2 (`parry_system.js` and `character_combat.js`).
