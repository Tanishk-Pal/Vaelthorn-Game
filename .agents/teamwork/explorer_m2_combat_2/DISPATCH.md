# Task Assignment: Milestone 2 Exploration — Character Combat Controller Specialist

## Identity
- Role: Character Combat Exploration Specialist
- Type: teamwork_explorer
- Working Directory: E:\Vaelthorn\.agents\teamwork\explorer_m2_combat_2\
- Parent: orchestrator (0662e5fe-b14b-4fce-9b62-c302d4d9285e)

## Mandatory Reading
- ORIGINAL_REQUEST.md: E:\Vaelthorn\.agents\teamwork\ORIGINAL_REQUEST.md
- PROJECT.md: E:\Vaelthorn\PROJECT.md
- Docs: E:\Vaelthorn\Docs\GDD_Vaelthorn.md and E:\Vaelthorn\Docs\Technical_Plan_Vaelthorn.md
- Existing math engines: E:\Vaelthorn\src\engine\kinematics.js, hitbox.js, combat_math.js
- Engine loader & E2E tests: E:\Vaelthorn\tests\helpers\engine_loader.js and E:\Vaelthorn\tests\e2e\

## Objectives
1. Read ORIGINAL_REQUEST.md and PROJECT.md. Note the strict requirement: authentic mathematical implementation, zero cheating/facades.
2. Investigate the mathematical requirements and interface contracts for `src/engine/character_combat.js`:
   - Kaelen player combat controller state machine: `IDLE`, `MOVE`, `ATTACK_1`, `ATTACK_2`, `ATTACK_3`, `GUARD`, `DODGE_ROLL`, `SPELL_CAST`, `HIT_STUN`, `DEAD`.
   - 3-hit combo buffer ($0.20\text{s}$ queue window) and combo reset ($0.65\text{s}$ recovery timeout).
   - Attack frame timings: Swing 1 (22 dmg, 0.22s duration, reach 2.4m), Swing 2 (28 dmg, 0.22s duration, reach 2.4m), Swing 3 (48 dmg finisher, 0.30s duration, reach 2.6m, heavy knockback).
   - Hit-stop scheduling: timescale pause for 0.04s on light hits (Swings 1 & 2), 0.08s on finisher (Swing 3) and parry.
   - Weapon profiles:
     - Ashen Longsword ("Penumbra"): standard 3-hit combo (22/28/48 dmg).
     - Executioner's Great-Mace: slower heavy swings (35/45/75 dmg), hyper-armor (uninterruptible by light attacks).
     - Twin Eclipse Daggers: fast 3-hit combo (14/18/32 dmg), lower recovery, generates +25 resonance per hit.
   - Universal Health model: 100 max HP, taking damage, post-damage invincibility frames (0.30s I-frames), healing.
   - Integration with `kinematics.js`, `hitbox.js`, `combat_math.js`, and `parry_system.js`.
3. Provide a complete, production-grade technical design for `character_combat.js` and proposed unit tests for `tests/unit/character_combat.test.js`.
4. Deliver `combat_design.md` and `handoff.md` in your working directory, then message orchestrator.


## 2026-11-01T04:32:38Z
You are explorer_m2_combat_2, a specialist in player combat state machines and combo systems.
Your working directory is: E:\Vaelthorn\.agents\teamwork\explorer_m2_combat_2\
Read your task assignment at: E:\Vaelthorn\.agents\teamwork\explorer_m2_combat_2\DISPATCH.md.
MANDATORY: Read ORIGINAL_REQUEST.md at E:\Vaelthorn\.agents\teamwork\ORIGINAL_REQUEST.md and PROJECT.md at E:\Vaelthorn\PROJECT.md before beginning.
Design the mathematical architecture and interface contracts for src/engine/character_combat.js and tests/unit/character_combat.test.js.
Focus on 3-hit combo buffer/reset timings, hit-stop scheduler, weapon profiles (Penumbra Longsword, Great-Mace with hyper-armor, Twin Daggers), health container, and post-damage I-frames.
Deliver combat_design.md and handoff.md in your working directory, then message orchestrator (0662e5fe-b14b-4fce-9b62-c302d4d9285e).
