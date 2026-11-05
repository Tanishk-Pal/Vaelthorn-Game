# DISPATCH: Milestone 1 Exploration — Combat Math & Damage Engine Design

You are `explorer_m1_combatmath_3` (role: Combat Math Exploration Specialist).
Your working directory is: `E:\Vaelthorn\.agents\teamwork\explorer_m1_combatmath_3\`

## Mandatory Reading
- Original User Request: `E:\Vaelthorn\.agents\teamwork\ORIGINAL_REQUEST.md`
- Master Plan: `E:\Vaelthorn\PROJECT.md`
- Spec Report: `E:\Vaelthorn\.agents\teamwork\spec_miner_survey_1\spec_report.md`
- Prototype: `E:\Vaelthorn\Vaelthorn_Playable_Prototype.html`

## Objective
Design the complete mathematical specification, algorithms, and interface contract for `src/engine/combat_math.js`:
1. Exact damage formulas:
   - Combo sequence damages: Hit 1 = $22$, Hit 2 = $28$, Hit 3 (Finisher) = $48$
   - Critical riposte damage multiplier: $2.5\times$ base damage against staggered/poise-broken targets
   - Damage mitigation:
     $$D_{\text{taken}} = \max\left(1, \frac{D_{\text{raw}}}{1 + \frac{\text{defense}}{100}}\right)$$
   - Poise damage & poise break threshold calculation:
     $$\text{currentPoise} = \max(0, \text{currentPoise} - \text{poiseDamage})$$
     If $\text{currentPoise} \le 0$, entity enters `STAGGER` state for $1.2\text{ s}$.
   - Stygian Resonance accumulation formula:
     $$\text{Resonance}_{\text{new}} = \min(100, \text{Resonance} + \Delta R)$$
     Where $\Delta R = +15$ on light hit, $+100$ on perfect parry. Out-of-combat decay: $-5\text{ units/s}$ after $4.0\text{ s}$ idle.
   - Parabolic trajectory math for projectile firing (Archer arrows / flaming stakes):
     $$\vec{r}(t) = \vec{r}_0 + \vec{v}_0 t + \frac{1}{2}\vec{g} t^2$$
2. Provide exact JavaScript signatures, exported functions, constants, JSDoc schemas, and verification test vectors.
3. Recommend implementation guidelines and edge-case guards (e.g. defense $\ge 0$, no negative damage, zero division defense guards, resonance bounds $[0, 100]$) for Worker.

## Constraints
- Read-only exploration. Do NOT write source code in `src/`.
- Write your report to: `E:\Vaelthorn\.agents\teamwork\explorer_m1_combatmath_3\combat_math_design.md`
- Write your handoff to: `E:\Vaelthorn\.agents\teamwork\explorer_m1_combatmath_3\handoff.md`
- Send completion message to orchestrator.


## 2026-11-01T02:52:50Z
You are explorer_m1_combatmath_3. Your working directory is E:\Vaelthorn\.agents\teamwork\explorer_m1_combatmath_3\.
Please read your instructions in E:\Vaelthorn\.agents\teamwork\explorer_m1_combatmath_3\DISPATCH.md, E:\Vaelthorn\PROJECT.md, and E:\Vaelthorn\.agents\teamwork\ORIGINAL_REQUEST.md.
Design the complete mathematical specification, damage mitigation formulas, poise calculation, resonance accumulation, and parabolic projectile trajectory math for src/engine/combat_math.js.
Output your findings to E:\Vaelthorn\.agents\teamwork\explorer_m1_combatmath_3\combat_math_design.md and E:\Vaelthorn\.agents\teamwork\explorer_m1_combatmath_3\handoff.md.
Communicate back to orchestrator via send_message when complete.
