# Task Assignment: Adversarial Character Combat & Spell Verification

## Identity
- Role: Adversarial Character Combat Verifier
- Type: teamwork_challenger
- Working Directory: E:\Vaelthorn\.agents\teamwork\challenger_m2_2\
- Parent: orchestrator (0662e5fe-b14b-4fce-9b62-c302d4d9285e)

## Mandatory Reading
- ORIGINAL_REQUEST.md: E:\Vaelthorn\.agents\teamwork\ORIGINAL_REQUEST.md
- PROJECT.md: E:\Vaelthorn\PROJECT.md
- Worker Handoff: E:\Vaelthorn\.agents\teamwork\worker_m2_combat_1\handoff.md

## Objectives
1. Read ORIGINAL_REQUEST.md and PROJECT.md. Note the strict requirement: authentic implementation, zero cheating/facades.
2. Adversarially challenge `src/engine/character_combat.js`:
   - Design an adversarial stress harness (`stress_character_combat.js`) executing >=10,000 trials testing:
     - 10-state FSM illegal transitions (e.g. attacking while DEAD or in HIT_STUN without hyper-armor).
     - 3-hit combo buffer timing windows: $0.08\text{s}$ lockout against rapid spamming, $0.20\text{s}$ queue buffer, and $0.65\text{s}$ combo reset timeout under extreme delta-time jitter.
     - Hit-stop timescale freezes: verifying combat displacement and timers freeze during hit-stop frames ($0.04\text{s}$ / $0.08\text{s}$) while retaining buffered inputs.
     - Weapon profiles: Penumbra Longsword ($22/28/48$), Great-Mace hyper-armor (swallow damage during swing without stagger), and Twin Daggers (+25 resonance/hit).
     - Health container edge cases: negative damage, overkill damage, post-damage I-frames ($0.30\text{s}$) blocking rapid multi-hits, and health regeneration capping at maxHp.
     - Stygian Resonance economy: $[0, 100]$ boundary clamping, Overdrive mode transitions at 100 with $1.30\times$ damage, and continuous decay after delay.
     - Stygian Lance spell: 16m beam AABB piercing across 100 aligned enemies with zero duplicate hits, 25 cost deduction, and knockback scaling.
3. Run test regression (`node --test tests/unit/*.test.js`, `node --test tests/e2e/*.test.js`, `node tests/playtest_runner.js`).
4. Deliver `handoff.md` in your working directory with an explicit verdict: APPROVE or REQUEST_CHANGES, then message orchestrator.


## 2026-11-01T05:05:44Z
From: orchestrator (0662e5fe-b14b-4fce-9b62-c302d4d9285e)
You are challenger_m2_2, an adversarial verifier for player character combat and spell casting.
Your working directory is: E:\Vaelthorn\.agents\teamwork\challenger_m2_2\
Read your task assignment at: E:\Vaelthorn\.agents\teamwork\challenger_m2_2\DISPATCH.md.
MANDATORY: Read ORIGINAL_REQUEST.md at E:\Vaelthorn\.agents\teamwork\ORIGINAL_REQUEST.md and PROJECT.md at E:\Vaelthorn\PROJECT.md before beginning.
Design and execute an adversarial stress test harness (stress_character_combat.js) testing:
- 10-state FSM illegal transitions
- 3-hit combo buffer timing windows (0.08s lockout, 0.20s queue buffer, 0.65s reset timeout under extreme dt jitter)
- Hit-stop timescale freezes (displacement & timers freeze while retaining buffers)
- Weapon profiles (Longsword, Great-Mace hyper-armor damage absorption, Twin Daggers resonance)
- Health container bounds, overkill clamping, 0.30s post-damage I-frames
- Stygian Resonance economy bounds, Overdrive mode transitions (+30% damage), decay
- Stygian Lance spell 16m beam AABB multi-target zero-duplicate piercing across 100 aligned enemies
Deliver handoff.md in your working directory with an explicit verdict of APPROVE or REQUEST_CHANGES, then message orchestrator (0662e5fe-b14b-4fce-9b62-c302d4d9285e).
