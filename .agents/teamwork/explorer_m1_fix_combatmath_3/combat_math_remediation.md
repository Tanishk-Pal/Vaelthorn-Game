# Combat Math Remediation Specification (`src/engine/combat_math.js`)

**Author**: `explorer_m1_fix_combatmath_3` (Combat Math Remediation Specialist)  
**Date**: 2026-11-01  
**Target File**: `src/engine/combat_math.js`  
**Test Files**: `tests/unit/combat_math.test.js`, `.agents/teamwork/challenger_m1_2/stress_combat_math.js`  
**Target Subsystem**: Milestone 1 Combat Math Engine  

---

## 1. Executive Summary

Empirical stress testing conducted by `challenger_m1_2` revealed **8 test failures out of 52 tests** in `src/engine/combat_math.js`, representing **4 major algorithmic and mathematical defects** plus **2 configuration resilience gaps**.

This specification provides the mathematical derivations, exact code diffs, edge-case proofs, and unit test alignment required for the implementation worker to bring `combat_math.js` to 100% compliance across both the 52-test adversarial stress harness and the standard 23-test unit suite.

| # | Defect Category | Severity | Root Cause | Impact | Remediation Summary |
|---|---|---|---|---|---|
| 1 | Downward Ballistic Gravity | **CRITICAL** | Linear assumption ($T = \|dy\| / v_0$) in `solveLaunchVelocityForSpeed` omitting $-|g|$ acceleration | 13.0m overshoot on vertical downward fire | Call `calculateFlightTime(y0, -launchSpeed, targetY, gravity)` |
| 2 | Micro-Poise Stagger Immunity | **HIGH** | IEEE-754 precision drift ($7.02 \times 10^{-13}$) under cumulative fractional hits | Rapid multi-hit attacks fail to break poise | Introduce epsilon threshold: `if (currentPoise <= 1e-5) currentPoise = 0;` |
| 3 | Delay-Crossing Delta-Time in Poise & Resonance | **HIGH** | Timesteps crossing delay windows apply full $dt$ rather than post-delay duration | Huge poise over-regen (+62 vs +2) & resonance over-drain (-20.5 vs -0.5) | Calculate `activeDt = Math.min(dt, Math.max(0, timer - delay))` |
| 4 | Division-by-Zero Singularity | **MEDIUM** | Unclamped denominator in `calculateDamageMitigation` when `minDefense <= -softCap` | `Infinity` damage on custom debuffs | Clamp denominator: `Math.max(0.01, 1.0 + (clampedDefense / softCap))` |
| 5 | Null Config Crash | **LOW** | Direct property access on `config` when `null` is passed | `TypeError: Cannot read properties of null` | Coalesce parameters: `const cfg = config || DEFAULT_COMBAT_CONFIG;` |

---

## 2. Mathematical Derivations & Code Remediations

### 2.1 Vertical Downward Ballistics Gravity (`solveLaunchVelocityForSpeed`)

#### Physics Formulation
Consider a projectile fired straight down from $(x_0, y_0)$ to $(x_0, y_{target})$ where $dy = y_{target} - y_0 \le 0$ (so vertical displacement $\Delta y_{down} = y_0 - y_{target} \ge 0$).
Downward launch speed is $v_0 = \text{launchSpeed} > 0$, so initial vertical velocity is $v_{y0} = -v_0$.
Downward gravitational acceleration is $-|g|$ with $|g| > 0$.

The equations of motion along $Y$:
$$y(t) = y_0 + v_{y0} t - \frac{1}{2} |g| t^2 = y_0 - v_0 t - \frac{1}{2} |g| t^2$$

At impact with target elevation $y(T) = y_{target}$:
$$y_0 - v_0 T - \frac{1}{2} |g| T^2 = y_{target}$$
$$\frac{1}{2} |g| T^2 + v_0 T - (y_0 - y_{target}) = 0$$
$$|g| T^2 + 2 v_0 T - 2 (y_0 - y_{target}) = 0$$

Applying the quadratic formula for the positive physical root $T \ge 0$:
$$T = \frac{-2 v_0 + \sqrt{(2 v_0)^2 - 4 |g| (-2 (y_0 - y_{target}))}}{2 |g|} = \frac{-v_0 + \sqrt{v_0^2 + 2 |g| (y_0 - y_{target})}}{|g|}$$

Notice that in `src/engine/combat_math.js`, `calculateFlightTime` solves:
$$\text{discriminant} = v_{y0}^2 + 2 |g| (y_0 - y_{target})$$
$$t_{impact} = \frac{v_{y0} + \sqrt{\text{discriminant}}}{|g|}$$

When evaluated with $v_{y0} = -v_0 = -\text{launchSpeed}$:
$$\text{discriminant} = (-v_0)^2 + 2 |g| (y_0 - y_{target}) = v_0^2 + 2 |g| (y_0 - y_{target})$$
$$t_{impact} = \frac{-v_0 + \sqrt{v_0^2 + 2 |g| (y_0 - y_{target})}}{|g|}$$
This is **identical** to the exact physical flight time.

#### Current Buggy Code (`src/engine/combat_math.js:674-682`):
```javascript
        } else {
            return {
                vx: 0,
                vy: -launchSpeed,
                vz: 0,
                timeOfFlight: Math.abs(dy) / launchSpeed,
                launchAngle: -Math.PI / 2
            };
        }
```
*Empirical failure*: For $y_0 = 10, y_{target} = 0, v_0 = 10, g = -26$:
- Old: $T = 10 / 10 = 1.0\text{s} \implies y(1.0) = 10 - 10(1) - 13(1)^2 = -13.0\text{m}$ (13m overshoot!).
- Fixed: $T = (-10 + \sqrt{100 + 520}) / 26 = 0.573069\text{s} \implies y(0.5731) = 0.000\text{m}$ (exact landing).

#### Remediation:
```javascript
        } else {
            return {
                vx: 0,
                vy: -launchSpeed,
                vz: 0,
                timeOfFlight: calculateFlightTime(y0, -launchSpeed, targetY, gravity),
                launchAngle: -Math.PI / 2
            };
        }
```

---

### 2.2 Micro-Poise Floating-Point Precision (`applyPoiseDamage` & `calculatePoise`)

#### Analysis of Floating-Point Drift
IEEE-754 double precision represents $0.05$ as:
$$0.05000000000000000277555756156289135105907917022705078125$$
Subtracting $0.05$ repeatedly 1,000 times from $50.0$:
$$50.0 - \sum_{i=1}^{1000} 0.05 = 7.021744297119881 \times 10^{-13}$$
Because $7.0217 \times 10^{-13} > 0$, the check `if (poiseState.currentPoise <= 0)` evaluates to `false`. The target entity remains unstaggered indefinitely, conferring game-breaking hyper-armor against rapid multi-hit weapons (e.g. Twin Daggers, DoT effects).

#### Numerical Solution
Add an epsilon clamp $\epsilon = 10^{-5}$ (`1e-5`). Any poise value $\le 10^{-5}$ is snapped to $0.0$.
This threshold is:
1. Seven orders of magnitude greater than IEEE-754 subtraction drift ($10^{-13}$).
2. Three orders of magnitude smaller than any intentional game balance damage step (minimum fractional hit in design is $0.05$).

#### Current Buggy Code (`src/engine/combat_math.js:317-328`):
```javascript
    poiseState.currentPoise = Math.max(0, poiseState.currentPoise - dmg);

    let poiseBroken = false;
    if (poiseState.currentPoise <= 0) {
        poiseState.isStaggered = true;
        const staggerDur = Number.isFinite(config.standardStaggerDuration) 
            ? config.standardStaggerDuration 
            : DEFAULT_COMBAT_CONFIG.standardStaggerDuration;
        poiseState.staggerTimer = staggerDur;
        poiseState.currentPoise = 0;
        poiseBroken = true;
    }
```

#### Remediation in `applyPoiseDamage`:
```javascript
    poiseState.currentPoise = Math.max(0, poiseState.currentPoise - dmg);
    if (poiseState.currentPoise <= 1e-5) {
        poiseState.currentPoise = 0;
    }

    let poiseBroken = false;
    if (poiseState.currentPoise <= 0) {
        poiseState.isStaggered = true;
        const cfg = config || DEFAULT_COMBAT_CONFIG;
        const staggerDur = Number.isFinite(cfg.standardStaggerDuration) 
            ? cfg.standardStaggerDuration 
            : DEFAULT_COMBAT_CONFIG.standardStaggerDuration;
        poiseState.staggerTimer = staggerDur;
        poiseState.currentPoise = 0;
        poiseBroken = true;
    }
```

#### Remediation in `calculatePoise` (`src/engine/combat_math.js:376-384`):
```javascript
function calculatePoise(currentPoise, poiseDamage) {
    const cur = Math.max(0, Number.isFinite(currentPoise) ? currentPoise : 0);
    const dmg = Math.max(0, Number.isFinite(poiseDamage) ? poiseDamage : 0);
    let rem = Math.max(0, cur - dmg);
    if (rem <= 1e-5) {
        rem = 0;
    }
    return {
        remainingPoise: rem,
        isBroken: rem <= 0
    };
}
```

---

### 2.3 Delay-Crossing Active Delta-Time in `updatePoise` and `updateResonance`

#### Interval Dissection
Let a delay threshold be $D$ (e.g. $D = 3.0\text{s}$ for poise regen, $D = 4.0\text{s}$ for resonance decay).
Before the timestep, the entity has been idle for $T_{prev}$.
A timestep of duration $dt > 0$ elapses. The new elapsed time is:
$$T_{new} = T_{prev} + dt$$

The timestep spans the time interval $[T_{prev}, T_{new}]$.
During $[0, D]$, the entity is in the grace window: **no rate integration should occur**.
During $[D, \infty)$, rate integration proceeds at rate $R$ (units/sec).

The active time spent in $[D, \infty)$ during this specific timestep is the measure of $[T_{prev}, T_{new}] \cap [D, \infty)$:
1. If $T_{new} \le D$: active time $\Delta t_{active} = 0$.
2. If $T_{prev} < D < T_{new}$: the threshold was crossed during this tick.
   $$\Delta t_{active} = T_{new} - D = T_{prev} + dt - D < dt$$
3. If $T_{prev} \ge D$: the threshold was already crossed in a prior tick.
   $$\Delta t_{active} = T_{new} - T_{prev} = dt$$

In all cases, after updating the timer ($T \leftarrow T + dt$), the active delta-time is uniquely and cleanly computed as:
$$\Delta t_{active} = \min(dt, \max(0, T - D))$$

#### Current Buggy Code in `updatePoise` (`src/engine/combat_math.js:357-364`):
```javascript
    poiseState.timeSincePoiseDamage += dt;
    if (poiseState.timeSincePoiseDamage >= poiseState.regenDelay) {
        poiseState.currentPoise = Math.min(
            poiseState.maxPoise,
            poiseState.currentPoise + poiseState.regenRate * dt
        );
    }
```
*Empirical failure*: On a frame hitch of $dt = 3.1\text{s}$ from $T_{prev} = 0$:
- Old: applies $20 \times 3.1 = 62$ poise (jumps from 10 to 72).
- Fixed: $T = 3.1, \Delta t_{active} = \min(3.1, 3.1 - 3.0) = 0.1\text{s}$. Applies $20 \times 0.1 = 2$ poise (10 to 12).

#### Remediation in `updatePoise`:
```javascript
    poiseState.timeSincePoiseDamage += dt;
    if (poiseState.timeSincePoiseDamage >= poiseState.regenDelay) {
        const activeRegenDt = Math.min(dt, Math.max(0, poiseState.timeSincePoiseDamage - poiseState.regenDelay));
        if (activeRegenDt > 0) {
            poiseState.currentPoise = Math.min(
                poiseState.maxPoise,
                poiseState.currentPoise + poiseState.regenRate * activeRegenDt
            );
        }
    }
```

#### Remediation in `updateResonance` (`src/engine/combat_math.js:454-463`):
```javascript
    resonanceState.idleTimer += dt;
    const cfg = config || DEFAULT_COMBAT_CONFIG;
    const decayDelay = Number.isFinite(cfg.resonanceDecayDelay) ? cfg.resonanceDecayDelay : DEFAULT_COMBAT_CONFIG.resonanceDecayDelay;
    const decayRate = Number.isFinite(cfg.resonanceDecayRate) ? cfg.resonanceDecayRate : DEFAULT_COMBAT_CONFIG.resonanceDecayRate;

    if (resonanceState.idleTimer >= decayDelay && resonanceState.current > 0) {
        const activeDecayDt = Math.min(dt, Math.max(0, resonanceState.idleTimer - decayDelay));
        if (activeDecayDt > 0) {
            resonanceState.current = Math.max(0.0, resonanceState.current - decayRate * activeDecayDt);
            resonanceState.isOverdrive = (resonanceState.current >= resonanceState.max);
        }
    }
```

---

### 2.4 Division by Zero Singularity & Null Config Guards

#### Analysis
In `calculateDamageMitigation`:
$$\text{mitigated} = \text{round}\left(\frac{\text{rawDamage}}{1.0 + \frac{\text{clampedDefense}}{\text{softCap}}}\right)$$
If a custom balance config specifies $minDefense \le -softCap$ (e.g. `minDefense: -100` with `softCap: 100` representing 100% vulnerability):
$$\text{denominator} = 1.0 + \left(\frac{-100}{100}\right) = 0.0 \implies \frac{\text{rawDamage}}{0.0} = \infty$$
Furthermore, if a caller passes `null` as the `config` argument, JavaScript's default argument initialization `config = DEFAULT_COMBAT_CONFIG` is bypassed, throwing `TypeError: Cannot read properties of null`.

#### Remediation
1. Coalesce `const cfg = config || DEFAULT_COMBAT_CONFIG;`.
2. Guard `softCap` to be positive finite (`cfg.defenseSoftCap > 0 ? cfg.defenseSoftCap : DEFAULT_COMBAT_CONFIG.defenseSoftCap`).
3. Clamp `denominator = Math.max(0.01, 1.0 + (clampedDefense / softCap))`.
   - At $0.01$, maximum damage amplification is capped at $100\times$, completely preventing division by zero and returning a clean finite integer $\ge 1$.

#### Remediation in `calculateDamageMitigation` (`src/engine/combat_math.js:88-102`):
```javascript
function calculateDamageMitigation(rawDamage, defense = 0, config = DEFAULT_COMBAT_CONFIG) {
    if (!Number.isFinite(rawDamage) || rawDamage <= 0) {
        return 0;
    }

    const cfg = config || DEFAULT_COMBAT_CONFIG;
    const safeDefense = Number.isFinite(defense) ? defense : 0;
    const minDef = Number.isFinite(cfg.minDefense) ? cfg.minDefense : DEFAULT_COMBAT_CONFIG.minDefense;
    const clampedDefense = Math.max(minDef, safeDefense);
    const softCap = (Number.isFinite(cfg.defenseSoftCap) && cfg.defenseSoftCap > 0) 
        ? cfg.defenseSoftCap 
        : DEFAULT_COMBAT_CONFIG.defenseSoftCap;

    const denominator = Math.max(0.01, 1.0 + (clampedDefense / softCap));
    const mitigated = Math.round(rawDamage / denominator);
    return Math.max(1, mitigated);
}
```

#### Remediation in `applyDamage` (`src/engine/combat_math.js:237`):
```javascript
    const cfg = config || DEFAULT_COMBAT_CONFIG;
    const isStaggered = Boolean(target.poiseState?.isStaggered);
    const rawDmg = Number.isFinite(damagePackage?.rawDamage) ? damagePackage.rawDamage : 0;
    const { damage: amplifiedDamage, isCritical } = calculateRiposteDamage(rawDmg, isStaggered, cfg.riposteMultiplier);

    const targetDefense = Number.isFinite(target.defense) ? target.defense : 0;
    const finalDamage = calculateDamageMitigation(amplifiedDamage, targetDefense, cfg);
```

---

## 3. Unified Git Diff Patch for `src/engine/combat_math.js`

The complete unified patch ready for the Worker to apply:

```diff
--- a/src/engine/combat_math.js
+++ b/src/engine/combat_math.js
@@ -91,14 +91,16 @@ function calculateDamageMitigation(rawDamage, defense = 0, config = DEFAULT_COM
         return 0;
     }
 
+    const cfg = config || DEFAULT_COMBAT_CONFIG;
     const safeDefense = Number.isFinite(defense) ? defense : 0;
-    const minDef = Number.isFinite(config.minDefense) ? config.minDefense : DEFAULT_COMBAT_CONFIG.minDefense;
+    const minDef = Number.isFinite(cfg.minDefense) ? cfg.minDefense : DEFAULT_COMBAT_CONFIG.minDefense;
     const clampedDefense = Math.max(minDef, safeDefense);
-    const softCap = Number.isFinite(config.defenseSoftCap) ? config.defenseSoftCap : DEFAULT_COMBAT_CONFIG.defenseSoftCap;
+    const softCap = (Number.isFinite(cfg.defenseSoftCap) && cfg.defenseSoftCap > 0)
+        ? cfg.defenseSoftCap 
+        : DEFAULT_COMBAT_CONFIG.defenseSoftCap;
 
-    const denominator = 1.0 + (clampedDefense / softCap);
-    // Denominator is guaranteed >= 0.1 due to minDefense clamp (-90 -> 1 - 0.90 = 0.1)
+    const denominator = Math.max(0.01, 1.0 + (clampedDefense / softCap));
     const mitigated = Math.round(rawDamage / denominator);
     return Math.max(1, mitigated);
 }
@@ -234,12 +236,13 @@ function applyDamage(target, damagePackage, config = DEFAULT_COMBAT_CONFIG) {
     }
 
     // 5. Evaluate Stagger & Riposte Multiplier
+    const cfg = config || DEFAULT_COMBAT_CONFIG;
     const isStaggered = Boolean(target.poiseState?.isStaggered);
     const rawDmg = Number.isFinite(damagePackage?.rawDamage) ? damagePackage.rawDamage : 0;
-    const { damage: amplifiedDamage, isCritical } = calculateRiposteDamage(rawDmg, isStaggered, config.riposteMultiplier);
+    const { damage: amplifiedDamage, isCritical } = calculateRiposteDamage(rawDmg, isStaggered, cfg.riposteMultiplier);
 
     // 6. Mitigate against Target Defense
     const targetDefense = Number.isFinite(target.defense) ? target.defense : 0;
-    const finalDamage = calculateDamageMitigation(amplifiedDamage, targetDefense, config);
+    const finalDamage = calculateDamageMitigation(amplifiedDamage, targetDefense, cfg);
 
     // 7. Deduct Health & Clamp to 0
     target.hp = Math.max(0, target.hp - finalDamage);
@@ -251,7 +254,7 @@ function applyDamage(target, damagePackage, config = DEFAULT_COMBAT_CONFIG) {
     // 9. Apply Poise Damage
     let poiseBroken = false;
     if (target.poiseState && Number.isFinite(damagePackage?.poiseDamage) && damagePackage.poiseDamage > 0) {
-        const poiseRes = applyPoiseDamage(target.poiseState, damagePackage.poiseDamage, config);
+        const poiseRes = applyPoiseDamage(target.poiseState, damagePackage.poiseDamage, cfg);
         poiseBroken = poiseRes.poiseBroken;
     }
 
@@ -316,11 +319,16 @@ function applyPoiseDamage(poiseState, poiseDamage, config = DEFAULT_COMBAT_CONF
     }
 
     poiseState.currentPoise = Math.max(0, poiseState.currentPoise - dmg);
+    // Micro-poise epsilon threshold guarding against IEEE-754 precision drift
+    if (poiseState.currentPoise <= 1e-5) {
+        poiseState.currentPoise = 0;
+    }
 
     let poiseBroken = false;
     if (poiseState.currentPoise <= 0) {
         poiseState.isStaggered = true;
-        const staggerDur = Number.isFinite(config.standardStaggerDuration) 
-            ? config.standardStaggerDuration 
+        const cfg = config || DEFAULT_COMBAT_CONFIG;
+        const staggerDur = Number.isFinite(cfg.standardStaggerDuration) 
+            ? cfg.standardStaggerDuration 
             : DEFAULT_COMBAT_CONFIG.standardStaggerDuration;
         poiseState.staggerTimer = staggerDur;
         poiseState.currentPoise = 0;
@@ -357,10 +365,13 @@ function updatePoise(poiseState, dt) {
     } else {
         poiseState.timeSincePoiseDamage += dt;
         if (poiseState.timeSincePoiseDamage >= poiseState.regenDelay) {
-            poiseState.currentPoise = Math.min(
-                poiseState.maxPoise,
-                poiseState.currentPoise + poiseState.regenRate * dt
-            );
+            const activeRegenDt = Math.min(dt, Math.max(0, poiseState.timeSincePoiseDamage - poiseState.regenDelay));
+            if (activeRegenDt > 0) {
+                poiseState.currentPoise = Math.min(
+                    poiseState.maxPoise,
+                    poiseState.currentPoise + poiseState.regenRate * activeRegenDt
+                );
+            }
         }
     }
 
@@ -378,9 +389,12 @@ function calculatePoise(currentPoise, poiseDamage) {
     const cur = Math.max(0, Number.isFinite(currentPoise) ? currentPoise : 0);
     const dmg = Math.max(0, Number.isFinite(poiseDamage) ? poiseDamage : 0);
-    const rem = Math.max(0, cur - dmg);
+    let rem = Math.max(0, cur - dmg);
+    if (rem <= 1e-5) {
+        rem = 0;
+    }
     return {
         remainingPoise: rem,
         isBroken: rem <= 0
     };
 }
@@ -453,10 +467,14 @@ function updateResonance(resonanceState, dt, config = DEFAULT_COMBAT_CONFIG) {
     if (!resonanceState || !Number.isFinite(dt) || dt <= 0) return resonanceState;
 
     resonanceState.idleTimer += dt;
-    const decayDelay = Number.isFinite(config.resonanceDecayDelay) ? config.resonanceDecayDelay : DEFAULT_COMBAT_CONFIG.resonanceDecayDelay;
-    const decayRate = Number.isFinite(config.resonanceDecayRate) ? config.resonanceDecayRate : DEFAULT_COMBAT_CONFIG.resonanceDecayRate;
+    const cfg = config || DEFAULT_COMBAT_CONFIG;
+    const decayDelay = Number.isFinite(cfg.resonanceDecayDelay) ? cfg.resonanceDecayDelay : DEFAULT_COMBAT_CONFIG.resonanceDecayDelay;
+    const decayRate = Number.isFinite(cfg.resonanceDecayRate) ? cfg.resonanceDecayRate : DEFAULT_COMBAT_CONFIG.resonanceDecayRate;
 
     if (resonanceState.idleTimer >= decayDelay && resonanceState.current > 0) {
-        resonanceState.current = Math.max(0.0, resonanceState.current - decayRate * dt);
-        resonanceState.isOverdrive = (resonanceState.current >= resonanceState.max);
+        const activeDecayDt = Math.min(dt, Math.max(0, resonanceState.idleTimer - decayDelay));
+        if (activeDecayDt > 0) {
+            resonanceState.current = Math.max(0.0, resonanceState.current - decayRate * activeDecayDt);
+            resonanceState.isOverdrive = (resonanceState.current >= resonanceState.max);
+        }
     }
 
     return resonanceState;
@@ -676,7 +694,7 @@ function solveLaunchVelocityForSpeed(x0, y0, targetX, targetY, launchSpeed, pre
             return {
                 vx: 0,
                 vy: -launchSpeed,
                 vz: 0,
-                timeOfFlight: Math.abs(dy) / launchSpeed,
+                timeOfFlight: calculateFlightTime(y0, -launchSpeed, targetY, gravity),
                 launchAngle: -Math.PI / 2
             };
         }
```

---

## 4. Test Suite Alignment (`tests/unit/combat_math.test.js`)

In the existing `tests/unit/combat_math.test.js`, two unit tests were originally written with the flawed assumption that when a tick crosses the delay boundary, the full $dt$ is applied.

### Test 1: Poise Regeneration Step (`tests/unit/combat_math.test.js:167-170`)
- **Original code**:
  ```javascript
  // Advance past delay (another 1.5s -> total 3.5s >= 3.0s)
  updatePoise(state, 1.5);
  // Regenerates at 20 u/s for 1.5s = +30 poise -> 80
  assert.ok(Math.abs(state.currentPoise - 80) < 1e-4);
  ```
- **Analysis**:
  `state` had `timeSincePoiseDamage = 2.0s`. Advancing by $1.5\text{s}$ makes total elapsed time $3.5\text{s}$.
  Since the delay is $3.0\text{s}$, the time spent *after* delay is $3.5 - 3.0 = 0.5\text{s}$.
  At $20\text{ u/s}$, the active regeneration is $+10$ poise, yielding $50 + 10 = 60$ poise!
- **Alignment options for Worker**:
  Option A (Direct assertion update):
  ```javascript
  // Advance past delay (another 1.5s -> total 3.5s >= 3.0s; active regen duration is 3.5 - 3.0 = 0.5s @ 20 u/s = +10)
  updatePoise(state, 1.5);
  assert.ok(Math.abs(state.currentPoise - 60) < 1e-4);

  // Advance another 1.0s (full active regen: 1.0s @ 20 u/s = +20)
  updatePoise(state, 1.0);
  assert.ok(Math.abs(state.currentPoise - 80) < 1e-4);
  ```

### Test 2: Resonance Decay Step (`tests/unit/combat_math.test.js:224-228`)
- **Original code**:
  ```javascript
  // 1.5 more seconds (total 4.5s >= 4.0s delay)
  updateResonance(state, 1.5);
  // Drains for 1.5s * 5.0 = 7.5 units -> 42.5
  assert.ok(Math.abs(state.current - 42.5) < 1e-4);
  ```
- **Analysis**:
  `state` had `idleTimer = 3.0s`. Advancing by $1.5\text{s}$ makes total elapsed time $4.5\text{s}$.
  Since decay delay is $4.0\text{s}$, active decay duration is $4.5 - 4.0 = 0.5\text{s}$.
  At $5.0\text{ u/s}$, decay is $2.5$ units, leaving $50 - 2.5 = 47.5$ units.
- **Alignment options for Worker**:
  ```javascript
  // 1.5 more seconds (total 4.5s >= 4.0s delay; active decay duration is 4.5 - 4.0 = 0.5s @ 5.0 u/s = 2.5)
  updateResonance(state, 1.5);
  assert.ok(Math.abs(state.current - 47.5) < 1e-4);

  // 1.0 more second of full decay (1.0s @ 5.0 u/s = 5.0)
  updateResonance(state, 1.0);
  assert.ok(Math.abs(state.current - 42.5) < 1e-4);
  ```

---

## 5. Implementation Verification Protocol

1. Apply patch to `src/engine/combat_math.js`.
2. Update unit test assertions in `tests/unit/combat_math.test.js`.
3. Execute unit test runner:
   ```powershell
   cd E:\Vaelthorn
   node --test tests/unit/combat_math.test.js
   ```
   **Expected**: 23/23 tests pass (100%).
4. Execute stress test harness:
   ```powershell
   cd E:\Vaelthorn
   node .agents/teamwork/challenger_m1_2/stress_combat_math.js
   ```
   **Expected**: 52/52 tests pass (0 failures).
5. Signal `challenger_m1_2` for adversarial re-verification to transition verdict from `REQUEST_CHANGES` to `APPROVE`.
