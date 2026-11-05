# DISPATCH: Milestone 1 Remediation Implementation

You are `worker_m1_fix_1` (role: Core Math Engine Developer).
Your working directory is: `E:\Vaelthorn\.agents\teamwork\worker_m1_fix_1\`

## Mandatory Reading
- Original User Request: `E:\Vaelthorn\.agents\teamwork\ORIGINAL_REQUEST.md`
- Master Plan: `E:\Vaelthorn\PROJECT.md`
- Kinematics Remediation: `E:\Vaelthorn\.agents\teamwork\explorer_m1_fix_kinematics_1\kinematics_remediation.md`
- Kinematics Patch: `E:\Vaelthorn\.agents\teamwork\explorer_m1_fix_kinematics_1\kinematics_remediation.patch`
- Hitbox Remediation: `E:\Vaelthorn\.agents\teamwork\explorer_m1_fix_hitbox_2\hitbox_remediation.md`
- Combat Math Remediation: `E:\Vaelthorn\.agents\teamwork\explorer_m1_fix_combatmath_3\combat_math_remediation.md`
- Combat Math Patch: `E:\Vaelthorn\.agents\teamwork\explorer_m1_fix_combatmath_3\combat_math.patch`
- Combat Math Tests Patch: `E:\Vaelthorn\.agents\teamwork\explorer_m1_fix_combatmath_3\tests_combat_math.patch`

## File Ownership
You exclusively own and may modify:
- `E:\Vaelthorn\src\engine\kinematics.js`
- `E:\Vaelthorn\src\engine\hitbox.js`
- `E:\Vaelthorn\src\engine\combat_math.js`
- `E:\Vaelthorn\tests\unit\combat_math.test.js`
- `E:\Vaelthorn\tests\unit\hitbox.test.js`
- `E:\Vaelthorn\tests\unit\kinematics.test.js`

## MANDATORY INTEGRITY WARNING
> DO NOT CHEAT. All implementations must be genuine. DO NOT
> hardcode test results, create dummy/facade implementations, or
> circumvent the intended task. A teamwork_auditor will independently
> verify your work. Integrity violations WILL be detected and your
> work WILL be rejected.

## Objective & Tasks
1. Apply the pre-integration swept collision algorithm and `maxDeltaTime` clamping from `kinematics_remediation.patch` to `src/engine/kinematics.js`.
2. Apply the zero-allocation AABB interval normalization from `hitbox_remediation.md` to `src/engine/hitbox.js`.
3. Apply `combat_math.patch` to `src/engine/combat_math.js` and `tests_combat_math.patch` to `tests/unit/combat_math.test.js` (fixing downward vertical ballistics, micro-poise epsilon threshold, delay crossing active delta-time calculations, and defense singularity safeguards).
4. Run verification commands and ensure 100% pass across all test suites:
   - `node --test tests/unit/*.test.js`
   - `node --test tests/e2e/*.test.js`
   - `node tests/playtest_runner.js`
   - `node .agents/teamwork/challenger_m1_1/stress_kinematics_hitbox.js`
   - `node .agents/teamwork/challenger_m1_2/stress_combat_math.js`
5. Report all outputs in `E:\Vaelthorn\.agents\teamwork\worker_m1_fix_1\handoff.md` and send message to orchestrator.


## 2026-11-01T03:55:29Z
You are worker_m1_fix_1. Your working directory is E:\Vaelthorn\.agents\teamwork\worker_m1_fix_1\.
Please read your instructions in E:\Vaelthorn\.agents\teamwork\worker_m1_fix_1\DISPATCH.md and E:\Vaelthorn\.agents\teamwork\ORIGINAL_REQUEST.md.
Apply the 3 remediation patches for kinematics.js, hitbox.js, and combat_math.js (along with tests/unit/combat_math.test.js).
Run:
- node --test tests/unit/*.test.js
- node --test tests/e2e/*.test.js
- node tests/playtest_runner.js
- node .agents/teamwork/challenger_m1_1/stress_kinematics_hitbox.js
- node .agents/teamwork/challenger_m1_2/stress_combat_math.js
Verify all pass with 0 failures.
Report results in handoff.md and send_message back to orchestrator.
