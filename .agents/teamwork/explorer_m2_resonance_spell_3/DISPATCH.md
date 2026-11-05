# Task Assignment: Milestone 2 Exploration — Resonance & Spell Specialist

## Identity
- Role: Resonance & Spell Specialist
- Type: teamwork_explorer
- Working Directory: E:\Vaelthorn\.agents\teamwork\explorer_m2_resonance_spell_3\
- Parent: orchestrator (0662e5fe-b14b-4fce-9b62-c302d4d9285e)

## Mandatory Reading
- ORIGINAL_REQUEST.md: E:\Vaelthorn\.agents\teamwork\ORIGINAL_REQUEST.md
- PROJECT.md: E:\Vaelthorn\PROJECT.md
- Docs: E:\Vaelthorn\Docs\GDD_Vaelthorn.md and E:\Vaelthorn\Docs\Technical_Plan_Vaelthorn.md
- Existing math engines: E:\Vaelthorn\src\engine\kinematics.js, hitbox.js, combat_math.js
- Engine loader & E2E tests: E:\Vaelthorn\tests\helpers\engine_loader.js and E:\Vaelthorn\tests\e2e\

## Objectives
1. Read ORIGINAL_REQUEST.md and PROJECT.md. Note the strict requirement: authentic mathematical implementation, zero cheating/facades.
2. Investigate the mathematical requirements and interface contracts for Stygian Resonance and Stygian Lance spell execution:
   - Resonance gauge $[0, 100]$:
     - Accumulation: +15 on light melee hits, +100 on precision parry (instant Overdrive), custom weapon gains.
     - Overdrive mode at 100: 1.25x damage multiplier on all melee attacks.
     - Decay model: 5.0s idle delay before decay, active decay rate of 10 units/s, clamping to 0.
   - Stygian Lance spell:
     - Cost: 25 resonance expenditure (fails if resonance < 25).
     - Range & Dimensions: 16m reach forward, 1.0m beam width ($x \in [player.x, player.x \pm 16.0]$ based on facing, $y \in [player.y, player.y + 1.8]$).
     - Piercing multi-target evaluation: pierces ALL enemies in path using `hitbox.js` `check2DOverlap`.
     - Damage & Knockback: 55 base magic damage, directional knockback ($6.0\text{ m/s}$ along facing).
     - Cooldown & Buffering: 1.5s spell cooldown, input buffer support during attack recovery.
   - Coordination with `character_combat.js` and `parry_system.js`.
3. Provide a complete, production-grade technical design for resonance and spell mechanics, and integration details for `character_combat.js` and `tests/unit/character_combat.test.js`.
4. Deliver `resonance_spell_design.md` and `handoff.md` in your working directory, then message orchestrator.


## 2026-11-01T04:32:52Z
[Message] timestamp=2026-11-01T04:32:52Z sender=0662e5fe-b14b-4fce-9b62-c302d4d9285e priority=MESSAGE_PRIORITY_HIGH
You are explorer_m2_resonance_spell_3, a specialist in resource economies and spell casting systems.
Your working directory is: E:\Vaelthorn\.agents\teamwork\explorer_m2_resonance_spell_3\
Read your task assignment at: E:\Vaelthorn\.agents\teamwork\explorer_m2_resonance_spell_3\DISPATCH.md.
MANDATORY: Read ORIGINAL_REQUEST.md at E:\Vaelthorn\.agents\teamwork\ORIGINAL_REQUEST.md and PROJECT.md at E:\Vaelthorn\PROJECT.md before beginning.
Design the mathematical architecture and interface contracts for Stygian Resonance accumulation/decay/Overdrive and the Stygian Lance piercing beam spell (16m range, 25 cost, 55 dmg, knockback, cooldown & buffer).
Deliver resonance_spell_design.md and handoff.md in your working directory, then message orchestrator (0662e5fe-b14b-4fce-9b62-c302d4d9285e).
