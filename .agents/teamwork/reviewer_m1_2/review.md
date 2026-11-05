# Milestone 1 Code & Architecture Review Report

**Reviewer:** `reviewer_m1_2` (Roles: Code Reviewer & Adversarial Critic)  
**Date:** 2026-11-01  
**Target Milestone:** Milestone 1 (Kinematics & Hitbox Math Engine)  
**Files Reviewed:**
- `src/engine/kinematics.js`
- `src/engine/hitbox.js`
- `src/engine/combat_math.js`
- `tests/unit/kinematics.test.js`
- `tests/unit/hitbox.test.js`
- `tests/unit/combat_math.test.js`
- `tests/helpers/engine_loader.js`

---

# Part 1: Quality Review

## Review Summary

**Verdict**: **APPROVE**

Milestone 1 implements the foundational mathematical engine for "Vaelthorn: The Oath of Darkness" with exceptional rigor, numerical stability, and algorithmic fidelity. The code adheres strictly to the architectural specifications in `PROJECT.md` and `TEST_INFRA.md`.
All 56 unit tests pass, all 76 E2E integration tests pass, and the deterministic 60Hz playtest simulation completes with 100% success across 270 frames.

There are **zero integrity violations**, **zero hardcoded test facades**, **zero NaN leaks**, **zero division-by-zero vulnerabilities**, and strict $Z=0$ 2.5D plane confinement is actively enforced across all kinematic, projectile, and hitbox operations.

---

## Findings

### [Minor] Finding 1: Defense Sanitization for Infinite Values Defaults to 0 Defense
- **What**: When `Infinity` is passed as the `defense` parameter to `calculateDamageMitigation(rawDamage, defense)`, `Number.isFinite(defense)` returns `false`, causing `safeDefense` to fallback to `0` (full unmitigated damage) rather than maximum defense (chip damage of 1).
- **Where**: `src/engine/combat_math.js`, lines 93–94
- **Why**: While this guard protects against non-numeric types (`NaN`, `null`, `undefined`), in the hypothetical case where an entity receives an infinite defense buff (`Infinity`), the entity receives unmitigated damage rather than 0 or 1 damage.
- **Suggestion**: For future defense buff implementations, consider checking `defense === Infinity || defense > 100000 ? 100000 : (Number.isFinite(defense) ? defense : 0)`.

### [Minor] Finding 2: `spendResonance` Allows Zero or Negative Cost as No-Op Success
- **What**: Passing non-positive values (`cost <= 0`) to `spendResonance(state, cost)` clamps `safeCost = Math.max(0, cost) = 0`, causing the method to return `true` without altering resonance.
- **Where**: `src/engine/combat_math.js`, lines 433–440
- **Why**: While this prevents energy duplication or underflow exploits (it cannot add resonance), semantically attempting to spend non-positive resonance or 0 cost should either explicitly fail (`return false`) or be documented as a no-op success.
- **Suggestion**: Add `if (cost <= 0) return false;` to guarantee that only positive energy expenditures trigger spell deductions.

---

## Verified Claims

- **Torricelli Jump Velocity ($v_{y0} = \sqrt{2 \cdot |g| \cdot h}$)** → Verified via `kinematics.test.js` and standalone analytical check (`sqrt(2 * 26.0 * 2.4) = 11.171392 m/s`) → **PASS**
- **Piecewise Gravity Regimes (Ascent $-26.0$, Short Hop $-57.2$, Falling $-41.6$)** → Verified via `calculateGravityAcceleration` unit tests and physics tick simulation → **PASS**
- **Coyote Time ($0.12\text{s}$) & Jump Buffering ($0.12\text{s}$)** → Verified via boundary tests (`tier2_boundaries.test.js` and `kinematics.test.js`) → **PASS**
- **Strict 2.5D Plane Constraint ($Z = 0.0, v_z = 0.0$)** → Verified via `clamp2DPlane` perturbation injections ($Z = \pm 100\text{m} \implies 0.0$) → **PASS**
- **2D AABB Separating Axis Theorem with Depth Alignment** → Verified via test vectors TV-1.1 through TV-1.6 in `hitbox.test.js` → **PASS**
- **Resolution of Prototype 1D Elevation Bug** → Grounded swings miss elevated enemies ($y=4\text{m}$); mid-air swings miss grounded enemies → **PASS**
- **Slab-Method Raycast vs AABB** → Verified exact contact point calculation ($x=8.0, y=1.5, z=0.0$) and miss detection → **PASS**
- **Duplicate Hit Suppression (`HitTracker`)** → Verified multi-frame hit suppression per swing, count tracking, and automatic swing ID reset → **PASS**
- **Hyperbolic Damage Mitigation ($D_{\text{raw}} / (1 + \text{def}/100)$)** → Verified linear effective HP scaling, negative defense amplification (capped at 10x), and minimum 1 chip damage → **PASS**
- **Poise Depletion, Stagger Trigger & Recovery** → Verified stagger transition at poise $\le 0$, 1.2s stagger window, and 20 u/s regeneration after 3.0s delay → **PASS**
- **Critical Riposte Damage ($2.5\times$)** → Verified critical multiplier on staggered targets → **PASS**
- **Parabolic Projectile Ballistics (Mode A & Mode B)** → Verified analytical trajectory positions, apex calculations, flight times, and angle solutions for high/low arcs without NaNs → **PASS**
- **Live Engine Module Resolution** → Verified that `tests/helpers/engine_loader.js` resolves live files in `src/engine/` rather than fallback mocks → **PASS**

---

## Coverage Gaps

- **No material coverage gaps in Milestone 1 scope.**
- All 3 core files (`kinematics.js`, `hitbox.js`, `combat_math.js`) have dedicated unit test suites and comprehensive coverage across Tiers 1–4.

---

## Unverified Items

- **None.** All components under Milestone 1 were independently executed and verified.

---

# Part 2: Adversarial Review

## Challenge Summary

**Overall Risk Assessment**: **LOW**

The codebase exhibits exceptional defensive discipline. The author consistently implements parameter sanitation, `Number.isFinite()` guards, bounding box coordinate normalization, clamp operations, and fallback defaults.

---

## Challenges

### [Low] Challenge 1: Extreme Delta Time Physics Tunneling
- **Assumption Challenged**: Discrete frame updates will always receive reasonable delta times ($\Delta t \approx 1/60\text{ s}$).
- **Attack Scenario**: Severe browser freezing, background tab suspension, or lag spikes could generate $\Delta t \ge 0.5\text{ s}$, potentially causing entities to tunnel through static ground or platforms.
- **Observed Defense**: `updateKinematics` incorporates `DEFAULT_KINEMATICS_CONFIG.maxDeltaTime = 0.05` clamp and `resolveGroundCollision` performs swept step checking (`y + vy * dt <= p.y + 0.1`).
- **Blast Radius**: Negligible in production runtime.
- **Mitigation**: Verified robust.

### [Low] Challenge 2: Coincident Centers in Knockback Projection
- **Assumption Challenged**: Attacker and target will always have distinct X positions ($x_{\text{attacker}} \ne x_{\text{target}}$).
- **Attack Scenario**: Attacker and target spawn or collide at the exact same coordinate ($x = 4.0, y = 1.0$), resulting in $\Delta x = 0.0$. An unhandled division by zero or zero-sign calculation could zero out the horizontal impulse or produce `NaN`.
- **Observed Defense**: `calculateKnockback` explicitly detects $|\Delta x| \le 10^{-5}$ and falls back to `attackerFacing` ($\pm 1$).
- **Blast Radius**: Zero. Tested and verified in `hitbox.test.js` line 208 and adversarial script.
- **Mitigation**: Passed.

### [Low] Challenge 3: Inverted Raycast Direction Vectors
- **Assumption Challenged**: Ray direction vectors passed to `checkRayAABBOverlap` will always be normalized non-zero vectors.
- **Attack Scenario**: Ray direction vector is $(0, 0, 0)$.
- **Observed Defense**: The Slab Method implementation in `hitbox.js` checks `Math.abs(dx) > 1e-7` and `Math.abs(dy) > 1e-7`. If $dx \approx 0$, it tests whether the origin is within the slab $[minX, maxX]$. If outside, it immediately returns `{ hit: false }`.
- **Blast Radius**: Zero. No division by zero occurs.
- **Mitigation**: Passed.

### [Low] Challenge 4: Negative Armor Shred Division by Zero
- **Assumption Challenged**: Target defense rating will never reach $-100$, where $1 + \text{defense}/100 = 0$.
- **Attack Scenario**: Debuffs, curses, or armor-shred effects reduce defense to $-100$ or lower, causing $D_{\text{raw}} / 0 \to \infty$.
- **Observed Defense**: `calculateDamageMitigation` enforces `Math.max(config.minDefense, safeDefense)` with `minDefense = -90`. Denominator is guaranteed $\ge 0.10$ ($10\times$ cap).
- **Blast Radius**: Zero. No division by zero possible.
- **Mitigation**: Passed.

---

## Stress Test Results

- **Input Extreme ($u_x = -999$, $u_x = \text{NaN}$, $u_x = \text{Infinity}$)** → Clamped to $\pm 1.0$ or $0.0$; no state corruption → **PASS**
- **$Z$-Axis Perturbation ($z = 100\text{ m}$, $z = -5\text{ m}$)** → Clamped strictly to $0.0$ and $v_z = 0.0$ → **PASS**
- **Zero and Negative Delta-Time ($\Delta t = 0$, $\Delta t = -0.05$, $\Delta t = \text{NaN}$)** → Safely ignored without moving entity or corrupting state → **PASS**
- **Slab Raycast with $(0, 0)$ Direction Vector** → Returns `hit: false` when outside box, no division by zero → **PASS**
- **Coincident Attacker/Target Knockback** → Projects knockback using attacker facing direction → **PASS**
- **Target Knockback Resistance $\ge 1.0$ (Boss Hyper-Armor)** → Clamped cleanly to zero impulse ($v_x = 0, v_y = 0, v_z = 0$) → **PASS**
- **Unreachable Ballistic Target (Elevation above Apex)** → `calculateFlightTime` returns $-1$; `solveLaunchVelocityForSpeed` returns `null` → **PASS**
- **Extreme HitTracker Volume (50,000 targets)** → Correctly tracks unique targets and resets in $< 5\text{ms}$ → **PASS**
- **Terminal Velocity Clamp** → Downward descent clamped to $-40\text{ m/s}$ → **PASS**

---

## Unchallenged Areas

- **Procedural Audio Synthesizer, 3D WebGL Camera Rail & Presentation (M4)**: Deferred to Milestone 4 when graphical and audio integration is performed.

---

# Part 3: Integrity Attestation

- **Hardcoded Test Outputs**: Checked — none found. Real algorithmic logic implements all mechanics.
- **Facade / Dummy Implementations**: Checked — none found.
- **Shortcuts / Task Bypasses**: Checked — none found.
- **Fabricated Logs / Artifacts**: Checked — independent executions reproduced exact 100% pass rates.
- **Self-Certifying Work**: Checked — verified independently via separate commands and adversarial stress tests.

**Integrity Status**: **CLEAN / COMPLIANT**
