# DISPATCH: Milestone 1 Implementation — Kinematics & Hitbox Math Engine

You are `worker_m1_math_1` (role: Core Math Engine Developer).
Your working directory is: `E:\Vaelthorn\.agents\teamwork\worker_m1_math_1\`

## Mandatory Reading
- Original User Request: `E:\Vaelthorn\.agents\teamwork\ORIGINAL_REQUEST.md`
- Project Master Plan: `E:\Vaelthorn\PROJECT.md`
- Kinematics Design: `E:\Vaelthorn\.agents\teamwork\explorer_m1_kinematics_1\kinematics_design.md`
- Hitbox Design: `E:\Vaelthorn\.agents\teamwork\explorer_m1_hitbox_2\hitbox_design.md`
- Combat Math Design: `E:\Vaelthorn\.agents\teamwork\explorer_m1_combatmath_3\combat_math_design.md`

## File Ownership
You exclusively own and may create/modify:
- `E:\Vaelthorn\src\engine\kinematics.js`
- `E:\Vaelthorn\src\engine\hitbox.js`
- `E:\Vaelthorn\src\engine\combat_math.js`
- `E:\Vaelthorn\tests\unit\kinematics.test.js`
- `E:\Vaelthorn\tests\unit\hitbox.test.js`
- `E:\Vaelthorn\tests\unit\combat_math.test.js`

Do NOT modify `Vaelthorn_Playable_Prototype.html` or files in `tests/e2e/`.

## MANDATORY INTEGRITY WARNING
> DO NOT CHEAT. All implementations must be genuine. DO NOT
> hardcode test results, create dummy/facade implementations, or
> circumvent the intended task. A teamwork_auditor will independently
> verify your work. Integrity violations WILL be detected and your
> work WILL be rejected.

## Objective & Implementation Requirements
1. **Implement `src/engine/kinematics.js`**:
   - Symplectic Semi-Implicit Euler integration, analytical takeoff velocity ($v_{y0} = \sqrt{2 \cdot |g| \cdot h} \approx 11.171392\text{ m/s}$), piecewise gravity (ascent $-26$, short hop $-57.2$, falling $-41.6$), coyote time ($0.12\text{ s}$), jump buffering ($0.12\text{ s}$), shadow dodge roll ($v_x = \text{facing} \times 16.0\text{ m/s}$, duration $0.35\text{ s}$, cooldown $0.50\text{ s}$, I-frames), strict $Z=0$ clamp, and swept ground collision.
   - Dual CommonJS / ESM export support so tests and web runtimes load seamlessly.
2. **Implement `src/engine/hitbox.js`**:
   - Robust 2D AABB overlap with depth validation, dynamic attack swing bounding box generation ($2.4\text{ m}$ reach, $1.8\text{ m}$ height, $0.2\text{ m}$ rear offset), Stygian Lance piercing beam AABB ($16\text{ m} \times 1.0\text{ m}$), 2D slab raycast, 2.5D directional knockback with $0.3$ vertical pop and coincident center resolution, and `HitTracker` duplicate hit suppression.
3. **Implement `src/engine/combat_math.js`**:
   - Damage values ($22, 28, 48$), critical riposte ($2.5\times$), defense mitigation formula ($D_{\text{taken}} = \max(1, \text{round}(D_{\text{raw}} / (1 + \text{defense}/100)))$) with singularity clamp, poise mechanics ($1.2\text{ s}$ stagger on break, recovery), Stygian Resonance ($[0, 100]$, $+15$ light hit, $+100$ parry, $-5.0\text{ u/s}$ decay after $4\text{s}$ idle, Overdrive mode at $100$), and parabolic projectile ballistics.
4. **Implement Unit Test Suites**:
   - `tests/unit/kinematics.test.js`
   - `tests/unit/hitbox.test.js`
   - `tests/unit/combat_math.test.js`
5. **Run Verification Command**:
   - Execute: `node --test tests/unit/*.test.js`
   - Verify that 100% of unit tests pass with zero failures and zero NaNs.
6. **Documentation & Handoff**:
   - Document commands and results in `E:\Vaelthorn\.agents\teamwork\worker_m1_math_1\handoff.md`.
   - Send completion message to orchestrator.


## 2026-11-01T03:03:24Z
From: 0662e5fe-b14b-4fce-9b62-c302d4d9285e
Message: You are worker_m1_math_1. Your working directory is E:\Vaelthorn\.agents\teamwork\worker_m1_math_1\.
Please read your instructions in E:\Vaelthorn\.agents\teamwork\worker_m1_math_1\DISPATCH.md and E:\Vaelthorn\.agents\teamwork\ORIGINAL_REQUEST.md.
Follow the designs in E:\Vaelthorn\.agents\teamwork\explorer_m1_kinematics_1\kinematics_design.md, E:\Vaelthorn\.agents\teamwork\explorer_m1_hitbox_2\hitbox_design.md, and E:\Vaelthorn\.agents\teamwork\explorer_m1_combatmath_3\combat_math_design.md.
Implement src/engine/kinematics.js, src/engine/hitbox.js, src/engine/combat_math.js, and tests/unit/kinematics.test.js, hitbox.test.js, combat_math.test.js.
Run node --test tests/unit/*.test.js and verify all tests pass.
Report results in handoff.md and communicate back via send_message.
