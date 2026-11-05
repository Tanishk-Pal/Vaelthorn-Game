# Task Assignment: Milestone 2 Implementation — Character Mechanics & Combat System

## Identity
- Role: Character Combat & Mechanics Developer
- Type: teamwork_worker
- Working Directory: E:\Vaelthorn\.agents\teamwork\worker_m2_combat_1\
- Parent: orchestrator (0662e5fe-b14b-4fce-9b62-c302d4d9285e)

## Mandatory Reading
- ORIGINAL_REQUEST.md: E:\Vaelthorn\.agents\teamwork\ORIGINAL_REQUEST.md
- PROJECT.md: E:\Vaelthorn\PROJECT.md
- Explorer 1 (Parry) Handoff & Code: E:\Vaelthorn\.agents\teamwork\explorer_m2_parry_1\handoff.md, parry_design.md, and proposed_parry_system.js
- Explorer 2 (Combat) Handoff & Design: E:\Vaelthorn\.agents\teamwork\explorer_m2_combat_2\handoff.md and combat_design.md
- Explorer 3 (Resonance & Spell) Handoff & Design: E:\Vaelthorn\.agents\teamwork\explorer_m2_resonance_spell_3\handoff.md and resonance_spell_design.md
- Existing math engines: E:\Vaelthorn\src\engine\kinematics.js, hitbox.js, combat_math.js
- Engine loader: E:\Vaelthorn\tests\helpers\engine_loader.js

## Write Ownership
You exclusively own:
- `src/engine/parry_system.js`
- `src/engine/character_combat.js`
- `tests/unit/parry_system.test.js`
- `tests/unit/character_combat.test.js`
- `tests/helpers/engine_loader.js` (to bind live modules)

## Objectives
1. Implement `src/engine/parry_system.js`:
   - Exact 6-frame ($0.10\text{s}$) deflection window with continuous delta-time integration.
   - Guard cooldown ($0.20\text{s}$) to prevent spamming.
   - Deflection logic against melee and projectile attacks; unblockable attack handling.
   - Rewards: 0 damage taken, 100 poise damage inflicted on attacker, +100 Stygian Resonance (instant Overdrive), 0.08s hit-stop trigger, and $2.5\times$ riposte damage multiplier on next attack within poise break window.
   - Full directional 2.5D check (deflects frontal attacks based on defender facing).
2. Implement `src/engine/character_combat.js`:
   - 10-state deterministic player combat state machine (`IDLE`, `MOVE`, `ATTACK_1`, `ATTACK_2`, `ATTACK_3`, `GUARD`, `DODGE_ROLL`, `SPELL_CAST`, `HIT_STUN`, `DEAD`).
   - 3-hit combo buffer engine with $0.08\text{s}$ lockout, $0.20\text{s}$ queue window, and $0.65\text{s}$ combo reset timeout.
   - Hit-stop scheduling ($0.04\text{s}$ light hits, $0.08\text{s}$ finisher/parry).
   - Three weapon profiles: Penumbra Longsword ($22/28/48$), Executioner's Great-Mace ($35/45/75$, Hyper-Armor), Twin Eclipse Daggers ($14/18/32$, $+25$ resonance/hit).
   - Health container (100 max HP, overkill clamping, $0.30\text{s}$ post-damage I-frames).
   - Stygian Resonance economy ($[0, 100]$, continuous decay, Overdrive at 100 with $1.30\times$ damage).
   - Stygian Lance spell execution (consumes 25 resonance, $16\text{m}$ beam AABB via `hitbox.js:createBeamAABB`, zero-duplicate piercing across ALL aligned enemies via `check2DOverlap` and `HitTracker`, 55 base damage, $6.0\text{ m/s}$ directional knockback, 1.5s cooldown, 0.20s buffer).
3. Update `tests/helpers/engine_loader.js`:
   - Wire `ParrySystem` and `PlayerCombat` to resolve from live `src/engine/` files.
4. Author comprehensive unit test suites:
   - `tests/unit/parry_system.test.js`
   - `tests/unit/character_combat.test.js`
5. Verify test execution:
   - `node --test tests/unit/*.test.js`
   - `node --test tests/e2e/*.test.js`
   - `node tests/playtest_runner.js`
   - All tests must pass with 100% success.
6. Deliver `handoff.md` in your working directory with all verification results, then message orchestrator.

## MANDATORY INTEGRITY WARNING
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.


## 2026-11-01T04:44:39Z
You are worker_m2_combat_1, the developer responsible for implementing Milestone 2: Character Mechanics & Combat System.
Your working directory is: E:\Vaelthorn\.agents\teamwork\worker_m2_combat_1\
Read your task assignment at: E:\Vaelthorn\.agents\teamwork\worker_m2_combat_1\DISPATCH.md.
MANDATORY: Read ORIGINAL_REQUEST.md at E:\Vaelthorn\.agents\teamwork\ORIGINAL_REQUEST.md and PROJECT.md at E:\Vaelthorn\PROJECT.md before writing code.
Read Explorer reports and designs:
- E:\Vaelthorn\.agents\teamwork\explorer_m2_parry_1\handoff.md, parry_design.md, and proposed_parry_system.js
- E:\Vaelthorn\.agents\teamwork\explorer_m2_combat_2\handoff.md and combat_design.md
- E:\Vaelthorn\.agents\teamwork\explorer_m2_resonance_spell_3\handoff.md and resonance_spell_design.md
Implement:
1. src/engine/parry_system.js
2. src/engine/character_combat.js
3. Wire live resolution in tests/helpers/engine_loader.js
4. tests/unit/parry_system.test.js
5. tests/unit/character_combat.test.js
Verify by running:
- node --test tests/unit/*.test.js
- node --test tests/e2e/*.test.js
- node tests/playtest_runner.js
MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.
Deliver handoff.md in your working directory and message orchestrator (0662e5fe-b14b-4fce-9b62-c302d4d9285e).
