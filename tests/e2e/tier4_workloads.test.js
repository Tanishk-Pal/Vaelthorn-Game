/**
 * Tier 4 - Real-World Application Scenarios (Workloads) Test Suite
 * 
 * Executes full multi-second combat encounters:
 * 1. Protagonist vs Ashen Footman (Patrol -> Aggro -> Telegraph -> Parry -> Stagger -> Riposte Combo -> Defeat)
 * 2. Protagonist vs Cinder-Bough Archer (Sniper parabolic shot -> Dodge Roll through projectile -> Lance snipe)
 * 3. Protagonist vs Boss Vael-Krag (Phase 1 -> Bell Sweep & Jump -> Phase 2 Transition at 50% HP -> Leap Slam Dodge -> Defeat)
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const {
    Kinematics,
    Hitbox,
    CombatMath,
    ParryModule,
    CharacterCombat,
    EnemyAI,
    BossEncounter
} = require('../helpers/engine_loader.js');

describe('Tier 4: Real-World Combat Workloads', () => {

    test('Encounter Workload 1: Kaelen vs Ashen Footman Complete Combat Flow', () => {
        const dt = 1 / 60; // 60Hz tick
        const player = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, facing: 1, isGrounded: true };
        const combat = new CharacterCombat.PlayerCombat();
        const parry = new ParryModule.ParrySystem(0.10);
        const footman = EnemyAI.createEnemyEntity('footman', 12.0, 0);

        assert.equal(footman.state, EnemyAI.AIStates.PATROL);

        // Step 1: Kaelen runs right toward Footman
        for (let frame = 0; frame < 30; frame++) {
            Kinematics.updateKinematics(player, { horizontal: 1.0 }, dt);
            EnemyAI.updateEnemyFSM(footman, player, dt);
        }
        assert.equal(footman.state, EnemyAI.AIStates.AGGRO, 'Footman entered AGGRO state when player reached aggro radius');

        for (let frame = 30; frame < 60; frame++) {
            Kinematics.updateKinematics(player, { horizontal: 1.0 }, dt);
            EnemyAI.updateEnemyFSM(footman, player, dt);
        }

        // Step 2: Footman closes in and begins telegraph attack
        while (footman.state !== EnemyAI.AIStates.ATTACK_WINDUP) {
            EnemyAI.updateEnemyFSM(footman, player, dt);
        }

        assert.equal(footman.state, EnemyAI.AIStates.ATTACK_WINDUP);
        assert.equal(footman.telegraphActive, true, 'Telegraph white glint visible to player');

        // Step 3: Advance until attack becomes active
        while (footman.state === EnemyAI.AIStates.ATTACK_WINDUP) {
            EnemyAI.updateEnemyFSM(footman, player, dt);
        }

        assert.equal(footman.state, EnemyAI.AIStates.ATTACK_ACTIVE);
        assert.ok(footman.activeHitbox !== null);

        // Step 4: Player executes perfect parry
        parry.triggerGuard();
        const parryResult = parry.evaluateIncomingHit({ damage: footman.activeHitbox.damage });

        assert.equal(parryResult.result, 'PARRIED');
        assert.equal(parryResult.damageTaken, 0);
        assert.equal(parryResult.enemyPoiseDamage, 100);

        // Footman is staggered
        footman.state = EnemyAI.AIStates.STAGGER;
        footman.timer = 1.2;
        combat.addResonance(parryResult.resonanceGain);
        assert.equal(combat.resonance, 100);
        assert.equal(combat.isOverdrive, true);

        // Step 5: Player unleashes 3-hit riposte combo
        // Hit 1
        const hit1 = combat.triggerAttack(0.0);
        const dmg1 = CombatMath.calculateDamage(hit1.damage, 0, true);
        footman.hp -= dmg1;
        combat.attackTimer = 0;

        // Hit 2
        const hit2 = combat.triggerAttack(0.25);
        const dmg2 = CombatMath.calculateDamage(hit2.damage, 0, true);
        footman.hp -= dmg2;
        combat.attackTimer = 0;

        // Hit 3 (Finisher)
        const hit3 = combat.triggerAttack(0.50);
        const dmg3 = CombatMath.calculateDamage(hit3.damage, 0, true);
        footman.hp -= dmg3;

        assert.ok(footman.hp <= 0, `Footman HP should be depleted (HP = ${footman.hp})`);

        // Update FSM to process defeat
        EnemyAI.updateEnemyFSM(footman, player, dt);
        assert.equal(footman.state, EnemyAI.AIStates.DEFEATED, 'Footman successfully defeated');
    });

    test('Encounter Workload 2: Kaelen vs Cinder-Bough Archer Sniper Combat Flow', () => {
        const dt = 1 / 60;
        const player = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, facing: 1, isGrounded: true, rollCooldown: 0 };
        const combat = new CharacterCombat.PlayerCombat();
        const archer = EnemyAI.createEnemyEntity('archer', 10.0, 0);

        // Archer acquires target and prepares sniper shot
        archer.state = EnemyAI.AIStates.AGGRO;
        EnemyAI.updateEnemyFSM(archer, player, dt);
        assert.equal(archer.state, EnemyAI.AIStates.ATTACK_WINDUP);

        // Complete telegraph to fire parabolic projectile
        while (archer.state === EnemyAI.AIStates.ATTACK_WINDUP) {
            EnemyAI.updateEnemyFSM(archer, player, dt);
        }

        assert.equal(archer.state, EnemyAI.AIStates.ATTACK_ACTIVE);
        assert.equal(archer.activeHitbox.isRanged, true);

        // Arrow travels along parabolic trajectory toward player
        const arrowOrigin = { x: archer.x, y: 1.2 };
        const arrowVel = { x: -14.0, y: 4.5 };
        const projectilePosAt05s = CombatMath.calculateTrajectory(arrowOrigin, arrowVel, -26.0, 0.5);
        assert.ok(projectilePosAt05s.x < archer.x, 'Arrow traveled left toward player');

        // Player executes Shadow Dodge Roll through arrow flight path
        Kinematics.updateKinematics(player, { rollPressed: true }, dt);
        assert.equal(player.isRolling, true);
        assert.equal(player.isInvulnerable, true);

        // Arrow impact during roll absorbs 0 damage
        combat.isInvulnerable = player.isInvulnerable;
        const damageResult = combat.takeDamage(archer.activeHitbox.damage);
        assert.equal(damageResult.damageTaken, 0, 'Dodge roll I-frame absorbed ranged stake');

        // Player closes in and casts Stygian Lance snipe
        combat.addResonance(30);
        const spell = combat.triggerSpell('stygian_lance');
        assert.equal(spell.success, true);

        // Check lance pierce hit on Archer at x=10
        const archerBox = { minX: 9.5, maxX: 10.5, minY: 0, maxY: 1.8 };
        const hitConfirmed = Hitbox.checkRaycastHit(player, 1, spell.range, archerBox);
        assert.equal(hitConfirmed, true, 'Stygian Lance pierced and struck Archer');

        archer.hp -= spell.damage; // 60 - 55 = 5
        assert.ok(archer.hp <= 5);

        // Final light strike finishes archer
        archer.hp -= 22;
        EnemyAI.updateEnemyFSM(archer, player, dt);
        assert.equal(archer.state, EnemyAI.AIStates.DEFEATED, 'Archer defeated');
    });

    test('Encounter Workload 3: Kaelen vs Boss Vael-Krag Complete Multi-Phase Encounter', () => {
        const dt = 1 / 60;
        const player = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, facing: 1, isGrounded: true, rollCooldown: 0 };
        const combat = new CharacterCombat.PlayerCombat();
        const boss = new BossEncounter.VaelKragBoss(12.0);

        assert.equal(boss.phase, 1);
        assert.equal(boss.hp, 400);

        // ==========================================
        // PHASE 1: Bell Sweep & Jump Avoidance
        // ==========================================
        player.x = 8.5; // Within 4.5m sweep range
        boss.cooldown = 0;
        boss.update(dt, player);
        assert.equal(boss.state, 'BELL_SWEEP_WINDUP');

        // Windup telegraph elapses
        boss.update(0.50, player);
        assert.equal(boss.state, 'BELL_SWEEP_ACTIVE');
        assert.ok(boss.activeHitbox !== null);

        // Player jumps over horizontal bell sweep
        Kinematics.updateKinematics(player, { jumpPressed: true, jumpHeld: true }, dt);
        assert.ok(player.vy > 10.0, 'Player jumps');

        // Mid-air position clears sweep hitbox
        Kinematics.updateKinematics(player, { jumpHeld: true }, 0.2);
        assert.ok(player.y > 1.0, `Player height is ${player.y}`);

        // Player attacks boss and deals 200 damage to trigger Phase 2
        boss.takeDamage(200);
        assert.equal(boss.hp, 200);
        assert.equal(boss.phase, 2, 'Boss transitioned to Phase 2 at exactly 50% HP');
        assert.equal(boss.state, 'PHASE_TRANSITION');

        // ==========================================
        // PHASE 2: Burning Ground & Leap Slam
        // ==========================================
        boss.update(1.2, player); // Transition finishes
        assert.equal(boss.state, 'IDLE');

        // Move player away to trigger Leap Slam (dist > 8m)
        player.x = -2.0;
        boss.cooldown = 0;
        boss.update(dt, player);
        assert.equal(boss.state, 'LEAP_SLAM_WINDUP');

        // Boss leaps through air
        boss.update(0.60, player);
        assert.equal(boss.state, 'LEAP_SLAM_AIR');

        // Boss lands on player location: spawns burning ground hazard pool & shockwave
        boss.update(0.50, player);
        assert.equal(boss.burningPools.length, 1, 'Burning ground pool spawned');
        assert.equal(boss.burningPools[0].duration, 6.0, 'Pool lasts 6 seconds');

        // Player times Dodge Roll through landing shockwave
        Kinematics.updateKinematics(player, { rollPressed: true }, dt);
        assert.equal(player.isRolling, true);
        combat.isInvulnerable = player.isInvulnerable;
        const slamDamage = combat.takeDamage(boss.activeHitbox.damage);
        assert.equal(slamDamage.damageTaken, 0, 'Slam shockwave dodged via roll I-frames');

        // ==========================================
        // FINISHER: Stygian Lance Railgun Blast
        // ==========================================
        // Build resonance to 100, trigger Overdrive
        combat.addResonance(100);
        assert.equal(combat.isOverdrive, true);

        // Cast Stygian Lance (55 dmg) + 3 combo strikes
        const lance = combat.triggerSpell('stygian_lance');
        assert.equal(lance.success, true);
        boss.takeDamage(lance.damage);

        // Deliver remaining combo attacks
        boss.takeDamage(150);
        assert.equal(boss.hp, 0, 'Boss HP fully depleted to 0');

        const finalStatus = boss.update(dt, player);
        assert.equal(finalStatus.state, 'DEFEATED');
        assert.equal(finalStatus.isDead, true, 'Boss Vael-Krag successfully defeated');
    });
});
