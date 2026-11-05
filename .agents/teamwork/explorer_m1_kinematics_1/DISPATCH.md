# DISPATCH: Milestone 1 Exploration — Kinematics Engine Design

You are `explorer_m1_kinematics_1` (role: Kinematics Exploration Specialist).
Your working directory is: `E:\Vaelthorn\.agents\teamwork\explorer_m1_kinematics_1\`

## Mandatory Reading
- Original User Request: `E:\Vaelthorn\.agents\teamwork\ORIGINAL_REQUEST.md`
- Master Plan: `E:\Vaelthorn\PROJECT.md`
- Spec Report: `E:\Vaelthorn\.agents\teamwork\spec_miner_survey_1\spec_report.md`
- Prototype: `E:\Vaelthorn\Vaelthorn_Playable_Prototype.html`

## Objective
Design the complete mathematical specification, algorithms, and interface contract for `src/engine/kinematics.js`:
1. Exact kinematics equations:
   - Horizontal velocity $v_x = u_x \cdot v_{move}$ with $v_{move} = 9.0\text{ m/s}$
   - Takeoff velocity $v_{y0} = \sqrt{2 \cdot |g| \cdot h}$ ($h=2.4\text{ m}$, $g=-26.0\text{ m/s}^2$)
   - Piecewise gravity: standard ascent ($g=-26.0$), short hop cut ($g \times 2.2 = -57.2$ when jump released early), snappy falling ($g \times 1.6 = -41.6$ when $v_y < 0$)
   - Coyote time ($0.12\text{ s}$) and jump buffering ($0.12\text{ s}$) state decrement and triggers
   - Shadow dodge roll: $v_x = \text{facing} \times 16.0\text{ m/s}$, duration $0.35\text{ s}$, cooldown $0.50\text{ s}$, I-frame flag active
   - Strict 2.5D clamp: $z(t) \equiv 0$, boundary tolerance $|z| \le 0.001$, clamped to $0.0$
   - Facing direction: flips $\pm 1$ when $|u_x| > 0.1$
2. Provide exact JavaScript function signatures, exported constants, type definitions (JSDoc), and numerical test cases.
3. Provide implementation recommendations and edge-case guards (NaN prevention, zero delta-time guard, terminal velocity clamp) for Worker.

## Constraints
- Read-only exploration. Do NOT write source code in `src/`.
- Write your report to: `E:\Vaelthorn\.agents\teamwork\explorer_m1_kinematics_1\kinematics_design.md`
- Write your handoff to: `E:\Vaelthorn\.agents\teamwork\explorer_m1_kinematics_1\handoff.md`
- Send completion message to orchestrator.


## 2026-11-01T02:52:23Z
You are explorer_m1_kinematics_1. Your working directory is E:\Vaelthorn\.agents\teamwork\explorer_m1_kinematics_1\.
Please read your instructions in E:\Vaelthorn\.agents\teamwork\explorer_m1_kinematics_1\DISPATCH.md, E:\Vaelthorn\PROJECT.md, and E:\Vaelthorn\.agents\teamwork\ORIGINAL_REQUEST.md.
Design the complete mathematical specification, numerical integration formulas, and interface contracts for src/engine/kinematics.js.
Output your findings to E:\Vaelthorn\.agents\teamwork\explorer_m1_kinematics_1\kinematics_design.md and E:\Vaelthorn\.agents\teamwork\explorer_m1_kinematics_1\handoff.md.
Communicate back to orchestrator via send_message when complete.
