# Handoff Report: Milestone 1 Adversarial Verification of `combat_math.js`

**Agent**: `challenger_m1_2`  
**Role**: Adversarial Verification Specialist (Critic / Empirical Challenger)  
**Target**: `src/engine/combat_math.js`  
**Date**: 2026-11-01  
**Verdict**: **`REQUEST_CHANGES`**  

---

## 1. Observation

Direct empirical observations from executing the stress test harness `node E:\Vaelthorn\.agents\teamwork\challenger_m1_2\stress_combat_math.js` on Node.js v24.19.0:

1. **Downward Vertical Ballistic Trajectory Overshoot (Line 679)**:
   - Command: `node E:\Vaelthorn\.agents\teamwork\challenger_m1_2\stress_combat_math.js`
   - Observation:
     ```
     [DIAGNOSTIC] Vertical downward fire target y=0, actual y at timeOfFlight: -13.000, error: 13.000m
     [FAIL] Vertical downward fire timeOfFlight lands on target y=0 (accounting for gravity acceleration): Actual y: -13, error: 13m
     ```
   - In `src/engine/combat_math.js:679`, when `absDx < 1e-4` and `dy <= 0`:
     `timeOfFlight: Math.abs(dy) / launchSpeed`
     For $y_0 = 10, targetY = 0, launchSpeed = 10, gravity = -26$:
     `timeOfFlight = 1.0s`. At $t = 1.0\text{s}$, $y(1.0) = 10 - 10(1) - 13(1)^2 = -13.0\text{m}$.

2. **Stagger Failure Under Fractional Micro-Poise Damage (Line 320 & 382)**:
   - Command output:
     ```
     [FAIL] Micro-staggers: 1,000 hits of 0.05 poise damage triggers stagger threshold under IEEE-754 precision: breakOccurred: false, final poise: 7.021744297119881e-13
     ```
   - In `src/engine/combat_math.js:320`:
     `poiseState.currentPoise = Math.max(0, poiseState.currentPoise - dmg);`
     `if (poiseState.currentPoise <= 0)`
     Evaluating $50.0 - (1000 \times 0.05)$ in IEEE-754 yields $7.021744297119881 \times 10^{-13}$. Since $7.02 \times 10^{-13} > 0$, `currentPoise <= 0` evaluates to `false`.

3. **Frame Hitch / Large Timestep Over-Regeneration in `updatePoise` (Lines 357-363)**:
   - Command output:
     ```
     [FAIL] Frame hitch / large timestep does not over-regenerate during delay phase: Expected ~12, got 72
     ```
   - In `src/engine/combat_math.js:358-363`:
     When a single timestep $dt = 3.1\text{s}$ occurs with `timeSincePoiseDamage = 0` and `regenDelay = 3.0s`, `timeSincePoiseDamage` reaches $3.1 \ge 3.0$. The code applies `regenRate * dt = 20 * 3.1 = 62` poise instead of $20 \times 0.1 = 2$ poise.

4. **Frame Hitch / Large Timestep Over-Drain in `updateResonance` (Lines 458-461)**:
   - Command output:
     ```
     [FAIL] Frame hitch / large timestep does not over-drain during delay phase: Expected ~99.5, got 79.5
     ```
   - In `src/engine/combat_math.js:458-461`:
     When $dt = 4.1\text{s}$ occurs with `idleTimer = 0` and `decayDelay = 4.0s`, it drains `5.0 * 4.1 = 20.5` resonance instead of $5.0 \times 0.1 = 0.5$ resonance.

5. **Division-by-Zero Singularity on Custom `minDefense` (Line 98)**:
   - Command output:
     ```
     [FAIL] Custom config with minDefense: -100 avoids Infinity division by zero: Got Infinity
     ```
   - In `src/engine/combat_math.js:98`:
     `const denominator = 1.0 + (clampedDefense / softCap);`
     With `minDefense = -100` and `defenseSoftCap = 100`, `denominator = 0.0`, resulting in `rawDamage / 0.0 = Infinity`.

6. **Uncaught TypeError on Null Config (Line 94 & 237)**:
   - Command output:
     ```
     [FAIL] calculateDamageMitigation survives null config without throwing TypeError
     ```
   - `TypeError: Cannot read properties of null (reading 'minDefense')`.

---

## 2. Logic Chain

1. **From Observation 1**: Projectile trajectory ballistics require that at $t = timeOfFlight$, the trajectory position $(x(t), y(t))$ matches the destination $(targetX, targetY)$. Line 679 sets $timeOfFlight = |dy| / v_0$, which assumes acceleration $a = 0$. However, $y(t)$ is integrated under downward gravity $g = -26\text{ m/s}^2$. The missing quadratic acceleration term $\frac{1}{2}|g|t^2$ results in an overshoot of $13.0\text{ meters}$, causing downward-aimed projectiles to miss targets.
2. **From Observation 2**: Games feature multi-hit attacks (e.g. Twin Daggers, multi-hit combo ticks, DoTs) that deal small fractional poise damage ($0.05 - 1.0$). IEEE-754 floating-point representation cannot represent $0.05$ exactly. Accumulating 1,000 subtractions leaves a residual of $\approx 7.02 \times 10^{-13}$. Because line 320 checks `poiseState.currentPoise <= 0` without an epsilon tolerance, the entity never staggers despite having sustained 50.0 cumulative poise damage.
3. **From Observations 3 and 4**: Real-time games running in browsers and WebGL experience frame hitches, tab defocusing, or variable delta times. When a timestep $dt$ crosses a grace window (`regenDelay` or `decayDelay`), only the time elapsed *after* the grace window should undergo rate integration. In both `updatePoise` and `updateResonance`, the code applies the full $dt$ once the threshold is crossed, resulting in massive spikes of artificial poise regeneration (+62 poise instead of +2) and artificial resonance depletion (-20.5 energy instead of -0.5).
4. **From Observations 5 and 6**: Defensive formula parameters and tuning configurations must remain robust against division by zero and null argument passing to avoid crashing the engine or generating infinite damage.
5. **Conclusion Link**: Therefore, while the core formula architecture is solid for standard unit test cases (44/52 stress tests pass), these 4 core defects directly compromise gameplay stability, combat balance, and trajectory aiming, requiring code changes before Milestone 1 sign-off.

---

## 3. Caveats

- **Scope Boundary**: This review tested pure mathematical algorithms in `src/engine/combat_math.js`. It did not test Three.js visual scene rendering or Web Audio synthesizer dispatch (which are decoupled from the pure math core).
- **Default Config vs Custom Config**: Singularity division by zero only manifests when custom balance configs specify `minDefense <= -softCap` (default config has `minDefense = -90`, which yields `denominator = 0.1` and avoids `Infinity`).
- **Target Platform**: Node.js v24.19.0 on Windows was the verification environment, which matches the IEEE-754 standard used by V8 in Chrome/WebGL.

---

## 4. Conclusion

**Verdict: `REQUEST_CHANGES`**

`src/engine/combat_math.js` requires the following modifications:
1. **Fix vertical downward ballistic solver**: Call `calculateFlightTime(y0, -launchSpeed, targetY, gravity)` in line 679 instead of `Math.abs(dy) / launchSpeed`.
2. **Add epsilon tolerance to poise checks**: Change `poiseState.currentPoise <= 0` to `poiseState.currentPoise <= 1e-6` in lines 320 and 382.
3. **Clamp timestep integration in `updatePoise`**: Apply `regenRate` only to `Math.min(dt, poiseState.timeSincePoiseDamage - poiseState.regenDelay)`.
4. **Clamp timestep integration in `updateResonance`**: Apply `decayRate` only to `Math.min(dt, resonanceState.idleTimer - decayDelay)`.
5. **Guard denominator in `calculateDamageMitigation`**: Set `Math.max(0.05, 1.0 + (clampedDefense / softCap))`.
6. **Guard optional `config` parameters**: Add `const cfg = config || DEFAULT_COMBAT_CONFIG;`.

---

## 5. Verification Method

To independently verify these findings:

1. **Execute the stress test harness**:
   ```powershell
   cd E:\Vaelthorn
   node E:\Vaelthorn\.agents\teamwork\challenger_m1_2\stress_combat_math.js
   ```
2. **Observe the test output**:
   - Verify that 44 tests PASS and 8 tests FAIL with the exact diagnostic messages cited above.
3. **Execute unit test suite**:
   ```powershell
   cd E:\Vaelthorn
   node --test tests/unit/combat_math.test.js
   ```
   (Unit tests pass 23/23 because they only exercise happy paths without micro-ticks or downward vertical fire).
4. **Invalidation Condition**:
   Once the implementer applies the mitigations detailed in `challenge_report.md`, re-running `node E:\Vaelthorn\.agents\teamwork\challenger_m1_2\stress_combat_math.js` will yield `52/52 Passed (0 Failed)`, at which point the verdict can transition to `APPROVE`.
