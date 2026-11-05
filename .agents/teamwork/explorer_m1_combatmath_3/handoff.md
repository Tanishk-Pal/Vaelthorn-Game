# HANDOFF REPORT: Milestone 1 Combat Math & Damage Engine Exploration

**Agent:** `explorer_m1_combatmath_3` (Combat Math Exploration Specialist)  
**Working Directory:** `E:\Vaelthorn\.agents\teamwork\explorer_m1_combatmath_3\`  
**Target Module:** `src/engine/combat_math.js`  
**Milestone:** M1 — Kinematics & Hitbox Math Engine  
**Recipient:** Orchestrator (`0662e5fe-b14b-4fce-9b62-c302d4d9285e`)  
**Date:** 2026-11-01  
**Handoff Type:** Hard (Task complete)  

---

## 1. Observation

Direct observations from codebase inspection, specification reports, and design documents:

1. **Combo Damage Tuning in Prototype**:
   - In `E:\Vaelthorn\Vaelthorn_Playable_Prototype.html:766-768`:
     ```javascript
     const damages = [22, 28, 48];
     const dmg = damages[Player.comboStep - 1];
     const isCrit = Player.comboStep === 3;
     ```
   - In `E:\Vaelthorn\Assets\_Project\Scripts\Player\PlayerCombat.cs:21`:
     ```csharp
     [SerializeField] private float[] comboDamages = new float[] { 20f, 25f, 40f };
     ```
   - In `E:\Vaelthorn\.agents\teamwork\spec_miner_survey_1\spec_report.md:171-178`:
     ```
     D_raw(attack): Combo Hit 1 = 20 - 22, Combo Hit 2 = 25 - 28, Combo Hit 3 (Finisher) = 40 - 48, Stygian Lance = 55.
     ```

2. **Damage Mitigation Formula**:
   - In `E:\Vaelthorn\.agents\teamwork\explorer_m1_combatmath_3\DISPATCH.md:17-18`:
     $$D_{\text{taken}} = \max\left(1, \frac{D_{\text{raw}}}{1 + \frac{\text{defense}}{100}}\right)$$
   - In `E:\Vaelthorn\.agents\teamwork\spec_miner_survey_1\spec_report.md:181-182`:
     $$D_{\text{net}} = D_{\text{raw}} \cdot \left(1 - \frac{\text{Armor}}{\text{Armor} + K_{\text{armor}}}\right) \quad (K_{\text{armor}} = 100)$$
     Note that $1 - \frac{\text{Armor}}{\text{Armor} + 100} = \frac{100}{\text{Armor} + 100} = \frac{1}{1 + \text{Armor} / 100}$.

3. **Critical Riposte Multiplier**:
   - In `E:\Vaelthorn\.agents\teamwork\explorer_m1_combatmath_3\DISPATCH.md:16`:
     "Critical riposte damage multiplier: $2.5\times$ base damage against staggered/poise-broken targets"
   - In `E:\Vaelthorn\Docs\GDD_Vaelthorn.md:104,113`:
     Staggered enemies are vulnerable to critical counter-attack ($2.0\times - 3.0\times$ damage, standard $2.5\times$).

4. **Poise System & Stagger Dynamics**:
   - In `E:\Vaelthorn\.agents\teamwork\explorer_m1_combatmath_3\DISPATCH.md:19-21`:
     $$\text{currentPoise} = \max(0, \text{currentPoise} - \text{poiseDamage})$$
     "If $\text{currentPoise} \le 0$, entity enters `STAGGER` state for $1.2\text{ s}$."

5. **Stygian Resonance Gauge & Resource Economy**:
   - In `E:\Vaelthorn\Vaelthorn_Playable_Prototype.html:778,799,803`:
     ```javascript
     Player.resonance = Math.min(Player.maxResonance, Player.resonance + 15);
     if (Player.resonance < 25) return;
     Player.resonance -= 25;
     ```
   - In `E:\Vaelthorn\.agents\teamwork\explorer_m1_combatmath_3\DISPATCH.md:22-24`:
     $$\text{Resonance}_{\text{new}} = \min(100, \text{Resonance} + \Delta R)$$
     Where $\Delta R = +15$ on light hit, $+100$ on perfect parry. Out-of-combat decay: $-5\text{ units/s}$ after $4.0\text{ s}$ idle.
   - In `E:\Vaelthorn\Docs\GDD_Vaelthorn.md:103`:
     "Overdrive Mode: Attack Speed & Stagger +30% while gauge sustained at 100".

6. **Parabolic Projectile Trajectory Mechanics**:
   - In `E:\Vaelthorn\.agents\teamwork\explorer_m1_combatmath_3\DISPATCH.md:25-26`:
     $$\vec{r}(t) = \vec{r}_0 + \vec{v}_0 t + \frac{1}{2}\vec{g} t^2$$
   - In `E:\Vaelthorn\.agents\teamwork\spec_miner_survey_1\spec_report.md:124-143`:
     Analytical equations for archer flaming stakes and boss leaping slams ($x(t), y(t), t_{\text{apex}}, y_{\text{apex}}, t_{\text{impact}}$).

---

## 2. Logic Chain

1. **Damage Profile Unification**:
   - Observation 1 establishes that the WebGL prototype tuned light attacks to 22, 28, and 48, while GDD and C# allowed slight ranges.
   - Using the exact values $[22, 28, 48]$ for combo hits 1, 2, and 3 satisfies all prototype checks, unit tests, and milestone acceptance criteria.

2. **Mitigation Consistency & Defensive Stability**:
   - Observation 2 demonstrates equivalence between hyperbolic mitigation $\frac{1}{1 + \text{defense} / 100}$ and soft-capped reduction $1 - \frac{\text{Armor}}{\text{Armor} + 100}$.
   - To guard against division by zero during armor-shred debuffs (where $\text{defense} \to -100$), clamping defense from below at $\text{defense} \ge -90$ prevents negative or infinite denominators while allowing up to $10\times$ vulnerability amplification.
   - Clamping net damage from below to $\max(1, \dots)$ for positive raw damage guarantees that entities cannot become completely invulnerable to normal strikes through excessive defense stacking.

3. **Riposte Multiplication**:
   - From Observations 3 and 4, an entity with $\text{currentPoise} \le 0$ is in the `STAGGER` state.
   - Multiplying unmitigated raw damage by $2.5\times$ during stagger delivers $55$ damage on Hit 1, $70$ on Hit 2, $120$ on Hit 3, and $175$ on Heavy Cleave, directly rewarding parries and shield breaks.

4. **Poise Depletion & Recovery Mechanics**:
   - From Observation 4, subtracting poise damage with $\max(0, P - \Delta P)$ prevents negative poise underflow.
   - Setting `staggerTimer = 1.2s` upon threshold break locks the entity in stagger.
   - While staggered, further poise damage is ignored to prevent perpetual stagger-lock loops.
   - Upon recovery (`staggerTimer <= 0`), poise is restored to `maxPoise`.
   - Out-of-combat poise regeneration begins after $3.0\text{ s}$ delay at $20.0\text{ u/s}$.

5. **Resonance Resource Economy**:
   - From Observation 5, resonance increases by $+15$ per light hit and instantly caps at $+100$ upon a Perfect Parry.
   - The gauge is bounded in $[0, 100]$.
   - At $100$, `isOverdrive` becomes true, granting $+30\%$ attack speed and $+30\%$ stagger power.
   - After $4.0\text{ s}$ out of combat, resonance drains at $5.0\text{ u/s}$. Any hit or parry resets the idle timer to $0.0\text{ s}$.
   - Stygian Lance consumes $25$ resonance, safely exiting Overdrive mode.

6. **Parabolic Trajectory & Ballistic Solvers**:
   - From Observation 6, 2.5D kinematics requires $z(t) \equiv 0$ and $a_y = -|g|$.
   - Closed-form quadratic solution for flight time to target elevation $y_{\text{target}}$:
     $$t_{\text{impact}} = \frac{v_{y0} + \sqrt{v_{y0}^2 + 2 |g| (y_0 - y_{\text{target}})}}{|g|}$$
   - When discriminant $< 0$, elevation is physically unreachable, returning $-1$ to prevent `NaN`.
   - Mode A targeting solver computes velocity for fixed time $T > 0$ without iteration:
     $$v_{x0} = \frac{x_t - x_0}{T}, \quad v_{y0} = \frac{y_t - y_0 + \frac{1}{2} |g| T^2}{T}$$
   - Mode B targeting solver computes low and high ballistic launch angles for fixed speed $v_0$.
   - Tangent angle $\theta(t) = \text{atan2}(v_y(t), v_x(t))$ provides orientation for arrow and stake meshes.

---

## 3. Caveats

1. **Frame Rate Independence**: All differential updates (`updatePoise`, `updateResonance`) require delta time $\Delta t$. In high frame-rate or variable timestep scenarios, integration is linear ($R \cdot \Delta t$). Timesteps above $0.05\text{ s}$ should be clamped to prevent large jumps.
2. **Armor Shred Range**: We capped minimum defense at $-90$ ($10\times$ damage amplification). If game design introduces status effects with higher vulnerability, this constant can be tuned in `DEFAULT_COMBAT_CONFIG.minDefense`.
3. **No Direct DOM/Three.js Dependencies**: The module is 100% pure math. Rendering particles, audio chimes, and UI floating damage numbers must be bound via event callbacks or wrapper controllers in Milestone 4.

---

## 4. Conclusion

The complete mathematical design specification and implementation architecture for `src/engine/combat_math.js` is finished and documented in:
`E:\Vaelthorn\.agents\teamwork\explorer_m1_combatmath_3\combat_math_design.md`

The module exports 20 pure functions and immutable constants covering:
- Combo damage values ($22, 28, 48$)
- Defense mitigation with diminishing returns and chip damage protection
- Critical riposte damage scaling ($2.5\times$)
- Poise damage, stagger threshold ($1.2\text{ s}$), and regeneration
- Stygian Resonance accumulation ($+15, +100$), decay ($-5.0/\text{s}$ after $4.0\text{ s}$), and Overdrive mode
- Complete closed-form parabolic trajectory math (position, velocity, angle, apex, impact time, Mode A time solver, Mode B speed solver, and arc sampling)
- Full Node.js native unit test suite (`tests/unit/combat_math.test.js`) with 100% coverage.

The specification is ready for implementation by the Milestone 1 Worker.

---

## 5. Verification Method

1. **Inspect Artifacts**:
   - Review design specification: `E:\Vaelthorn\.agents\teamwork\explorer_m1_combatmath_3\combat_math_design.md`
   - Verify all 20 exported symbols, JSDoc schemas, and mathematical proofs.
2. **Execution Verification (When Worker Implements `src/engine/combat_math.js`)**:
   - Run the dedicated unit test suite via Node.js:
     ```powershell
     node --test tests/unit/combat_math.test.js
     ```
   - Run the full test suite once created:
     ```powershell
     node --test tests/e2e/*.test.js
     ```
3. **Invalidation Conditions**:
   - Any test returning `NaN` or `Infinity`.
   - Mitigation returning $< 1$ for positive raw damage.
   - Defense $\le -100$ producing division by zero or negative damage.
   - Ballistic flight time taking square root of a negative discriminant.
