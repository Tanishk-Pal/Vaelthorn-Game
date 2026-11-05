# Task Assignment: Adversarial Parry & Deflection Verification

## Identity
- Role: Adversarial Parry & Deflection Verifier
- Type: teamwork_challenger
- Working Directory: E:\Vaelthorn\.agents\teamwork\challenger_m2_1\
- Parent: orchestrator (0662e5fe-b14b-4fce-9b62-c302d4d9285e)

## Mandatory Reading
- ORIGINAL_REQUEST.md: E:\Vaelthorn\.agents\teamwork\ORIGINAL_REQUEST.md
- PROJECT.md: E:\Vaelthorn\PROJECT.md
- Worker Handoff: E:\Vaelthorn\.agents\teamwork\worker_m2_combat_1\handoff.md

## Objectives
1. Read ORIGINAL_REQUEST.md and PROJECT.md. Note the strict requirement: authentic implementation, zero cheating/facades.
2. Adversarially challenge `src/engine/parry_system.js` and its integration with `character_combat.js`:
   - Design an adversarial stress harness (`stress_parry_system.js`) executing >=10,000 trials testing:
     - 6-frame window ($0.100\text{s}$) boundary precision ($t=0.099\text{s}$ succeeds, $t=0.100\text{s}$ fails).
     - Sub-frame delta-time sequences under extreme framerate jitter (15Hz, 30Hz, 60Hz, 120Hz, 240Hz, and random dt fuzzing).
     - Macro/key spamming against anti-spam guard cooldown ($0.20\text{s}$) — verify no perpetual deflection invulnerability.
     - 2.5D directional vector verification: frontal attacks deflect, backstabs fail and inflict full damage.
     - Projectile reflection trajectory velocity and knockback.
     - Unblockable/perilous attack bypass.
     - Poise break (100 poise damage) and $2.5\times$ riposte damage critical scaling.
3. Run test regression (`node --test tests/unit/*.test.js`, `node --test tests/e2e/*.test.js`, `node tests/playtest_runner.js`).
4. Deliver `handoff.md` in your working directory with an explicit verdict: APPROVE or REQUEST_CHANGES, then message orchestrator.


## 2026-11-01T05:05:27Z
Sender: 0662e5fe-b14b-4fce-9b62-c302d4d9285e
Content:
You are challenger_m2_1, an adversarial verifier for the parry & deflection system.
Your working directory is: E:\Vaelthorn\.agents\teamwork\challenger_m2_1\
Read your task assignment at: E:\Vaelthorn\.agents\teamwork\challenger_m2_1\DISPATCH.md.
MANDATORY: Read ORIGINAL_REQUEST.md at E:\Vaelthorn\.agents\teamwork\ORIGINAL_REQUEST.md and PROJECT.md at E:\Vaelthorn\PROJECT.md before beginning.
Design and execute an adversarial stress test harness (stress_parry_system.js) testing:
- Exact 6-frame window (0.10s) boundaries under variable dt (15Hz, 30Hz, 60Hz, 120Hz, 240Hz, jitter)
- Anti-spam guard cooldown (0.20s) under rapid macro mashing
- 2.5D directional vector checks (frontal parry vs back attack)
- Projectile reflection velocity and knockback
- Unblockable attack bypass
- Poise break (100) and 2.5x riposte multiplier
Deliver handoff.md in your working directory with an explicit verdict of APPROVE or REQUEST_CHANGES, then message orchestrator (0662e5fe-b14b-4fce-9b62-c302d4d9285e).
