# DISPATCH: Milestone 1 Remediation Exploration — Combat Math

You are `explorer_m1_fix_combatmath_3` (role: Combat Math Remediation Specialist).
Your working directory is: `E:\Vaelthorn\.agents\teamwork\explorer_m1_fix_combatmath_3\`

## Mandatory Reading
- Original User Request: `E:\Vaelthorn\.agents\teamwork\ORIGINAL_REQUEST.md`
- Master Plan: `E:\Vaelthorn\PROJECT.md`
- Challenger 2 Report: `E:\Vaelthorn\.agents\teamwork\challenger_m1_2\challenge_report.md`
- Challenger 2 Handoff: `E:\Vaelthorn\.agents\teamwork\challenger_m1_2\handoff.md`
- Current Code: `E:\Vaelthorn\src\engine\combat_math.js`

## Objective
Analyze the defects reported by `challenger_m1_2` in `src/engine/combat_math.js` and design the exact remediation:
1. **Vertical Downward Ballistics Gravity**:
   - In `solveLaunchVelocityForSpeed()`, vertical downward fire (`absDx < 1e-4, dy < 0`) omitted gravity acceleration, resulting in 13m overshoot.
   - Design the exact physical solution: $v_y = -\sqrt{v^2} = -v$, time of flight $t = \frac{-v + \sqrt{v^2 + 2 g \cdot (-dy)}}{g}$.
2. **Micro-Poise Damage Floating-Point Precision**:
   - Accumulation of small poise damage (e.g. 1000 hits of 0.05 on 50 poise) leaves $7.02 \times 10^{-13}$ poise without triggering stagger.
   - Add epsilon clamp: `if (entity.currentPoise <= 1e-5) entity.currentPoise = 0;`.
3. **Delay Crossing Delta-Time in `updatePoise` and `updateResonance`**:
   - If timer crosses delay in a single large frame tick, regeneration/decay currently applies full `dt` instead of elapsed time beyond threshold.
   - Design exact formula: `activeDt = Math.max(0, currentTimer + dt - delay);`.
4. **Division by Zero Guard on Custom Configs**:
   - Handle custom config `minDefense: -100` by clamping denominator: `Math.max(0.01, 1 + def / 100)`.
5. Provide exact code patch and test assertions for Worker.
6. Write report to `E:\Vaelthorn\.agents\teamwork\explorer_m1_fix_combatmath_3\combat_math_remediation.md` and handoff to `handoff.md`.


## 2026-11-01T03:33:37Z
Sender: 0662e5fe-b14b-4fce-9b62-c302d4d9285e
Content: You are explorer_m1_fix_combatmath_3. Your working directory is E:\Vaelthorn\.agents\teamwork\explorer_m1_fix_combatmath_3\.
Please read your instructions in E:\Vaelthorn\.agents\teamwork\explorer_m1_fix_combatmath_3\DISPATCH.md, E:\Vaelthorn\.agents\teamwork\challenger_m1_2\challenge_report.md, and E:\Vaelthorn\.agents\teamwork\ORIGINAL_REQUEST.md.
Design the fixes for downward vertical ballistics, micro-poise epsilon threshold, delay crossing activeDt in updatePoise and updateResonance, and division by zero guard in src/engine/combat_math.js.
Output your findings to combat_math_remediation.md and handoff.md, and send_message back to orchestrator.
