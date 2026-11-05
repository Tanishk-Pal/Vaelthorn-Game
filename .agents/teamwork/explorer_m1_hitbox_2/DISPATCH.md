# DISPATCH: Milestone 1 Exploration — Hitbox & Collision Math Engine Design

You are `explorer_m1_hitbox_2` (role: Hitbox Exploration Specialist).
Your working directory is: `E:\Vaelthorn\.agents\teamwork\explorer_m1_hitbox_2\`

## Mandatory Reading
- Original User Request: `E:\Vaelthorn\.agents\teamwork\ORIGINAL_REQUEST.md`
- Master Plan: `E:\Vaelthorn\PROJECT.md`
- Spec Report: `E:\Vaelthorn\.agents\teamwork\spec_miner_survey_1\spec_report.md`
- Prototype: `E:\Vaelthorn\Vaelthorn_Playable_Prototype.html`

## Objective
Design the complete mathematical specification, algorithms, and interface contract for `src/engine/hitbox.js`:
1. 2.5D geometric overlap equations:
   - AABB overlap test in 2D $(x, y)$ plane while locked to $z=0$:
     $$[x_{\min, A}, x_{\max, A}] \cap [x_{\min, B}, x_{\max, B}] \neq \emptyset \land [y_{\min, A}, y_{\max, A}] \cap [y_{\min, B}, y_{\max, B}] \neq \emptyset$$
   - Address the identified bug in `Vaelthorn_Playable_Prototype.html` where hitboxes were only 1D distance checks without Y vertical bounds.
   - Attack swing hitbox bounding box computation based on attacker position, facing ($\pm 1$), weapon reach, and swing height.
   - Raycast / line segment intersection for Stygian Lance piercing beam ($x_0$ to $x_0 + \text{facing} \cdot 16\text{ m}$, beam thickness $\Delta y = 1.0\text{ m}$).
2. Duplicate Hit Suppression (`HitTracker`):
   - Per-swing set of hit entity IDs to prevent multi-hit registering during a single attack animation.
3. 2.5D Directional Knockback:
   - Calculate knockback velocity vector: $\{ v_x: \text{sign}(\Delta x) \cdot \text{force}, v_y: 0.3 \cdot \text{force}, v_z: 0 \}$.
4. Provide exact JavaScript signatures, exported constants, type definitions (JSDoc), and numerical test vectors.
5. Provide implementation recommendations and edge-case guards for Worker.

## Constraints
- Read-only exploration. Do NOT write source code in `src/`.
- Write your report to: `E:\Vaelthorn\.agents\teamwork\explorer_m1_hitbox_2\hitbox_design.md`
- Write your handoff to: `E:\Vaelthorn\.agents\teamwork\explorer_m1_hitbox_2\handoff.md`
- Send completion message to orchestrator.


## 2026-11-01T02:52:40Z
You are explorer_m1_hitbox_2. Your working directory is E:\Vaelthorn\.agents\teamwork\explorer_m1_hitbox_2\.
Please read your instructions in E:\Vaelthorn\.agents\teamwork\explorer_m1_hitbox_2\DISPATCH.md, E:\Vaelthorn\PROJECT.md, and E:\Vaelthorn\.agents\teamwork\ORIGINAL_REQUEST.md.
Design the complete mathematical specification, 2.5D geometric overlap equations, duplicate hit suppression, and knockback vector calculations for src/engine/hitbox.js.
Output your findings to E:\Vaelthorn\.agents\teamwork\explorer_m1_hitbox_2\hitbox_design.md and E:\Vaelthorn\.agents\teamwork\explorer_m1_hitbox_2\handoff.md.
Communicate back to orchestrator via send_message when complete.
