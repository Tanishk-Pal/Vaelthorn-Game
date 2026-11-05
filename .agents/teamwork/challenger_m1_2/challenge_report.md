# Adversarial Challenge Report: Combat Math Engine (`src/engine/combat_math.js`)

**Target Subsystem**: `src/engine/combat_math.js`  
**Reviewer**: `challenger_m1_2` (Empirical Challenger / Adversarial Verification Specialist)  
**Date**: 2026-11-01  
**Harness**: `E:\Vaelthorn\.agents\teamwork\challenger_m1_2\stress_combat_math.js`  
**Explicit Verdict**: `REQUEST_CHANGES`

---

## Challenge Summary

**Overall Risk Assessment**: **CRITICAL**

Adversarial stress-testing of `src/engine/combat_math.js` across 52 automated fuzz and boundary tests revealed **44 Passes and 8 Failures**, uncovering **4 major algorithmic and mathematical defects** that compromise gameplay stability, combat state transitions, and projectile aiming:

1. **CRITICAL**: Parabolic trajectory solver (`solveLaunchVelocityForSpeed`) ignores gravity acceleration for vertical downward fire ($dx < 10^{-4}, dy < 0$), causing projectiles fired downward to overshoot their destination by **13.0 meters (130% error)**.
2. **HIGH**: Poise depletion fails to trigger stagger when taking rapid fractional micro-poise damage (e.g. 1,000 hits of $0.05$ on $50.0$ poise) due to IEEE-754 precision drift leaving $7.02 \times 10^{-13}$ poise without epsilon tolerance.
3. **HIGH**: Large timesteps / frame hitches crossing `regenDelay` in `updatePoise` over-regenerate poise by applying `regenRate * dt` across the entire timestep rather than only the time elapsed past `regenDelay` (granting $+62$ poise on a $3.1\text{s}$ tick instead of $+2$).
4. **HIGH**: Large timesteps / frame hitches crossing `decayDelay` in `updateResonance` over-drain resonance across the entire timestep rather than only the time elapsed past `decayDelay` (draining $20.5$ resonance on a $4.1\text{s}$ tick instead of $0.5$).
5. **MEDIUM**: `calculateDamageMitigation` produces `Infinity` when a custom config specifies $minDefense \le -softCap$ (e.g. `minDefense: -100`) due to un-guarded division by zero.
6. **LOW**: Public API functions throw uncaught `TypeError` when `null` is passed for optional `config` parameters.

---

## Challenges & Empirical Vulnerabilities

### [Critical] Challenge 1: Downward Vertical Ballistic Flight Time Ignores Gravity

- **Assumption Challenged**: Downward vertical projectile fire follows linear uniform motion without gravitational acceleration.
- **Location**: `src/engine/combat_math.js:675-681` in `solveLaunchVelocityForSpeed`:
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
- **Attack Scenario**: Firing downward from a high vantage point (e.g., Cinder Archer or player on a ledge at $(0, 10)$ targeting an enemy below at $(0, 0)$ at $v_0 = 10\text{ m/s}, g = -26\text{ m/s}^2$).
- **Empirical Result**: The solver outputs $T = |dy| / v_0 = 10 / 10 = 1.0\text{s}$. Evaluating the parabolic motion equation $y(T) = y_0 + v_{y0}T - \frac{1}{2}|g|T^2$ at $T = 1.0\text{s}$:
  $$y(1.0) = 10 - 10(1.0) - 13(1.0)^2 = -13.0\text{ m}$$
  Target elevation was $y = 0.0\text{m}$. The projectile overshoots the target by **$13.0\text{ meters}$**.
- **Blast Radius**: Any downward-firing projectile or archer AI targeting entities directly below completely misses targets, triggers premature despawns, or clips through ground geometry.
- **Recommended Mitigation**: Use the existing `calculateFlightTime` solver for downward fire as well:
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
  With this fix, $T = \frac{-10 + \sqrt{100 + 520}}{26} = 0.5731\text{s}$, giving $y(0.5731) = 0.000\text{m}$ (exact impact).

---

### [High] Challenge 2: Stagger Threshold Immunity Under Micro-Poise Damage (IEEE-754 Precision Drift)

- **Assumption Challenged**: Floating point subtraction of fractional poise damage reaches $\le 0$ when total damage equals or exceeds maximum poise.
- **Location**: `src/engine/combat_math.js:317-321` in `applyPoiseDamage` and line 382 in `calculatePoise`:
  ```javascript
  poiseState.currentPoise = Math.max(0, poiseState.currentPoise - dmg);
  let poiseBroken = false;
  if (poiseState.currentPoise <= 0) {
      poiseState.isStaggered = true;
      ...
  ```
- **Attack Scenario**: Inflicting small fractional poise damage hits (e.g. 1,000 hits of $0.05$ on a $50.0$ max poise target from rapid multi-hit weapons, poison/bleed ticks, or environmental hazards).
- **Empirical Result**: IEEE-754 arithmetic accumulation results in:
  $$50.0 - (1000 \times 0.05) = 7.021744297119881 \times 10^{-13} > 0$$
  Because $7.02 \times 10^{-13} > 0$, `poiseState.currentPoise <= 0` evaluates to `false`. Stagger is NEVER triggered; `poiseBroken` remains `false`.
- **Blast Radius**: Rapid-fire weapons (e.g. Twin Eclipse Daggers, damage-over-time spells) fail to trigger poise breaks against enemies, creating immortal hyper-armor exploits.
- **Recommended Mitigation**: Introduce an epsilon guard (e.g. `1e-6`):
  ```javascript
  if (poiseState.currentPoise <= 1e-6) {
      poiseState.currentPoise = 0;
      poiseState.isStaggered = true;
      ...
  ```

---

### [High] Challenge 3: Frame Hitch / Large Timestep Over-Regeneration in `updatePoise`

- **Assumption Challenged**: Timesteps $dt$ are small enough that the transition across `regenDelay` carries negligible time error.
- **Location**: `src/engine/combat_math.js:357-364` in `updatePoise`:
  ```javascript
  poiseState.timeSincePoiseDamage += dt;
  if (poiseState.timeSincePoiseDamage >= poiseState.regenDelay) {
      poiseState.currentPoise = Math.min(
          poiseState.maxPoise,
          poiseState.currentPoise + poiseState.regenRate * dt
      );
  }
  ```
- **Attack Scenario**: An entity takes poise damage, leaving poise at $10 / 100$. During the 3.0s `regenDelay`, a frame hitch or browser tab throttle produces a single timestep of $dt = 3.1\text{s}$.
- **Empirical Result**: `timeSincePoiseDamage` reaches $3.1\text{s} \ge 3.0\text{s}$. The code applies `regenRate * dt = 20 * 3.1 = 62` poise! Poise instantly jumps from 10 to 72. Only $0.1\text{s}$ elapsed past `regenDelay`, which should have added only $20 \times 0.1 = 2$ poise (resulting in 12).
- **Blast Radius**: Hitches, lag spikes, or pause transitions cause enemies or players to spontaneously restore massive amounts of poise during combat.
- **Recommended Mitigation**: Clamp regeneration to time elapsed strictly after `regenDelay`:
  ```javascript
  const previousTime = poiseState.timeSincePoiseDamage;
  poiseState.timeSincePoiseDamage += dt;
  if (poiseState.timeSincePoiseDamage >= poiseState.regenDelay) {
      const activeRegenDt = Math.min(dt, poiseState.timeSincePoiseDamage - poiseState.regenDelay);
      poiseState.currentPoise = Math.min(
          poiseState.maxPoise,
          poiseState.currentPoise + poiseState.regenRate * Math.max(0, activeRegenDt)
      );
  }
  ```

---

### [High] Challenge 4: Frame Hitch / Large Timestep Over-Drain in `updateResonance`

- **Assumption Challenged**: Timesteps $dt$ crossing `resonanceDecayDelay` drain energy proportionally to post-delay time.
- **Location**: `src/engine/combat_math.js:454-462` in `updateResonance`:
  ```javascript
  resonanceState.idleTimer += dt;
  if (resonanceState.idleTimer >= decayDelay && resonanceState.current > 0) {
      resonanceState.current = Math.max(0.0, resonanceState.current - decayRate * dt);
      resonanceState.isOverdrive = (resonanceState.current >= resonanceState.max);
  }
  ```
- **Attack Scenario**: Player sits at 100 resonance with `idleTimer = 0.0`. A frame hitch of $dt = 4.1\text{s}$ occurs (with `decayDelay = 4.0s`).
- **Empirical Result**: `idleTimer` reaches $4.1\text{s} \ge 4.0\text{s}$. The function subtracts `decayRate * dt = 5.0 * 4.1 = 20.5` resonance, dropping gauge from 100 to 79.5. The active decay duration was only $4.1 - 4.0 = 0.1\text{s}$, which should have subtracted only $5.0 \times 0.1 = 0.5$ resonance (gauge remaining at 99.5).
- **Blast Radius**: Frame drops or brief hitches immediately strip 20+ resonance from the player, prematurely terminating Overdrive mode.
- **Recommended Mitigation**: Compute active decay duration:
  ```javascript
  resonanceState.idleTimer += dt;
  if (resonanceState.idleTimer >= decayDelay && resonanceState.current > 0) {
      const activeDecayDt = Math.min(dt, resonanceState.idleTimer - decayDelay);
      resonanceState.current = Math.max(0.0, resonanceState.current - decayRate * Math.max(0, activeDecayDt));
      resonanceState.isOverdrive = (resonanceState.current >= resonanceState.max);
  }
  ```

---

### [Medium] Challenge 5: Division by Zero Singularity in `calculateDamageMitigation`

- **Assumption Challenged**: Custom balance configurations always supply $minDefense > -defenseSoftCap$.
- **Location**: `src/engine/combat_math.js:98-100`:
  ```javascript
  const denominator = 1.0 + (clampedDefense / softCap);
  const mitigated = Math.round(rawDamage / denominator);
  ```
- **Attack Scenario**: Passing `{ minDefense: -100, defenseSoftCap: 100 }` to represent 100% vulnerability debuff.
- **Empirical Result**: When `clampedDefense = -100`, `denominator = 1.0 + (-100 / 100) = 0.0`. `rawDamage / 0.0 = Infinity`.
- **Blast Radius**: Boss debuff or vulnerability status effect inflicts infinite damage and corrupts HP values to `NaN`/`Infinity`.
- **Recommended Mitigation**: Guard denominator to a positive minimum (e.g. `Math.max(0.05, denominator)`).

---

### [Low] Challenge 6: Uncaught TypeError on Null Configuration

- **Location**: `src/engine/combat_math.js:94` and `src/engine/combat_math.js:237`.
- **Attack Scenario**: Calling `calculateDamageMitigation(50, 0, null)` or `applyDamage(target, pkg, null)`.
- **Empirical Result**: Uncaught `TypeError: Cannot read properties of null (reading 'minDefense')`.
- **Recommended Mitigation**: Coalesce config: `const cfg = config || DEFAULT_COMBAT_CONFIG;`.

---

## Stress Test Results Summary

| Test # | Suite / Scenario | Expected Behavior | Actual Behavior | Verdict |
|---|---|---|---|---|
| 1.1 | Fuzzing defense [-1000 to 1e15] | Finite integer $\ge 1$ | Finite integer $\ge 1$ | **PASS** |
| 1.2 | Singularity defense = -100 (default config) | Clamped to -90 (500 dmg) | Clamped to -90 (500 dmg) | **PASS** |
| 1.3 | Astronomical defense (1e9) | Minimum 1 chip damage | Minimum 1 chip damage | **PASS** |
| 1.4 | Zero & negative raw damage | Exactly 0 damage | Exactly 0 damage | **PASS** |
| 1.5 | Non-finite damage (NaN, Inf, -Inf) | Sanitized to 0 | Sanitized to 0 | **PASS** |
| 1.6 | Non-finite defense (NaN, Inf) | Sanitized to 0 defense | Sanitized to 0 defense | **PASS** |
| 1.7 | calculateDamage negative defense | Clamped to 0 | Clamped to 0 | **PASS** |
| 1.8 | Custom config minDefense = -100 | Finite damage | `Infinity` | **FAIL** |
| 1.9 | Null config parameter | Safe fallback to default | `TypeError: Cannot read...` | **FAIL** |
| 1.10 | applyDamage on 1e9 defense entity | Chips 1 HP | Chips 1 HP (100 -> 99) | **PASS** |
| 2.1 | Non-finite poise damage (Infinity) | Sanitized without break | Sanitized without break | **PASS** |
| 2.2 | Massive poise damage (1e9) | Breaks poise cleanly | Breaks poise cleanly | **PASS** |
| 2.3 | Repeated hits on staggered entity | Does not re-break | Does not re-break | **PASS** |
| 2.4 | Micro-staggers (1000 x 0.05 on 50 poise) | Breaks poise on step 1000 | Never breaks ($7.02 \times 10^{-13}$ poise) | **FAIL** |
| 2.5 | Clean stagger recovery via updatePoise | Full poise restore | Restored to 50 | **PASS** |
| 2.6 | Poise during regenDelay | 0 regeneration | 0 regeneration | **PASS** |
| 2.7 | Poise regen at boundary (3.0s) | 0 regeneration at boundary | Over-regenerates $+10$ | **FAIL** |
| 2.8 | Poise regen after delay (3.5s) | $+10$ poise | $+20$ poise (adds for whole dt) | **FAIL** |
| 2.9 | Poise regen frame hitch ($dt = 3.1\text{s}$) | $+2$ poise (only 0.1s regen) | $+62$ poise (adds for 3.1s) | **FAIL** |
| 2.10 | Poise regen overfill clamp | Clamps at maxPoise | Clamped at maxPoise | **PASS** |
| 3.1 | 1,000 rapid light hits (+15 each) | Clamps at 100, Overdrive=true | Clamped at 100, Overdrive=true | **PASS** |
| 3.2 | Resonance spending & multiple casts | Drains to 0, no underflow | Drains to 0, no underflow | **PASS** |
| 3.3 | Resonance decay delay (4.0s @ 60fps) | Retains 100 energy | Retains 100 energy | **PASS** |
| 3.4 | Resonance decay rate (5.0 u/s) | Decays steadily to 0.0 | Decays steadily to 0.0 | **PASS** |
| 3.5 | Resonance frame hitch ($dt = 4.1\text{s}$) | $-0.5$ energy (99.5 remaining) | $-20.5$ energy (79.5 remaining) | **FAIL** |
| 4.1 | Extreme launch angles ($0^\circ, 90^\circ, 180^\circ$) | Exact matching radians | Exact matching radians | **PASS** |
| 4.2 | Analytical Apex (90 deg) | $t_{apex}=1.0\text{s}, y_{apex}=13.0\text{m}$ | $t_{apex}=1.0\text{s}, y_{apex}=13.0\text{m}$ | **PASS** |
| 4.3 | Ground flight time ($y_0=0, v_{y0}=26$) | Exactly 2.0s | Exactly 2.0s | **PASS** |
| 4.4 | Targets out of range (Mode B) | Returns `null` without NaN | Returns `null` cleanly | **PASS** |
| 4.5 | Negative & zero launch speed | Returns `null` | Returns `null` cleanly | **PASS** |
| 4.6 | Backward target Mode A | Lands on target $(-5, 2, 0)$ | Exact landing | **PASS** |
| 4.7 | Backward target Mode B (Low/High) | Lands on target $(-10, 0)$ | Exact landing | **PASS** |
| 4.8 | Downward vertical fire ($dx < 1e-4, dy < 0$) | Lands on target $y=0$ | Overshoots to $y = -13.0\text{m}$ | **FAIL** |
| 4.9 | Discrete sampling & Z=0 clamp | 31 points, $Z=0$ strict | 31 points, $Z=0$ strict | **PASS** |

---

## Unchallenged Areas

- **Graphical Rendering / Visual Mesh Binding**: Out of scope for pure mathematical combat engine.
- **Audio Synthesis Dispatch**: Out of scope for pure mathematical combat engine.
- **Network / Multiplayer Desynchronization**: Vaelthorn is a local single-player 2.5D client.

---

## Recommendation

**Verdict: REQUEST_CHANGES**  
The author/implementer must address the 4 core mathematical and algorithmic bugs before Milestone 1 combat math can be approved for downstream integration. Specific code remediation snippets have been provided for each finding.
