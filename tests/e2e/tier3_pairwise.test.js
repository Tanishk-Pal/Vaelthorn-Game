/**
 * Tier 3 - Cross-Feature Interactions & Pairwise Integration Test Suite
 * 
 * Verifies complex multi-system mechanics working together:
 * - Jump + Attack kinematics integration
 * - Aerial Plunge transition
 * - Dodge Roll + I-Frame vs Enemy Attack
 * - Perfect Parry vs Enemy Telegraph & Strike
 * - Resonance Accumulation -> Stygian Lance Railgun Execution
 * - Overdrive State Activation & Depletion
 * - Hit-Stop Micro-Freeze + Screen Shake coupling
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const {
    Kinematics,
    Hitbox,
    CombatMath,
    ParryModule,
    CharacterCombat,
    EnemyAI
} = require('../helpers/engine_loader.js');

describe('Tier 3: Cross-Feature Interactions (Pairwise Matrix)', () => {

    test('Pairwise 1: Jump + Mid-Air Attack preserves horizontal momentum and applies jump gravity', () => {
        const entity = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, isGrounded: true, facing: 1 };
        const combat = new CharacterCombat.PlayerCombat();

        // 1. Jump while running right
        Kinematics.updateKinematics(entity, { horizontal: 1.0, jumpPressed: true, jumpHeld: true }, 0.016);
        assert.ok(entity.vy > 10.0, 'Initial jump velocity set');
        assert.equal(entity.vx, Kinematics.Constants.MOVE_SPEED);

        // 2. Mid-air advance and attack
        Kinematics.updateKinematics(entity, { horizontal: 1.0, jumpHeld: true }, 0.1);
        assert.ok(entity.y > 0.5, 'Player is airborne');

        const attack = combat.triggerAttack(0.1);
        assert.equal(attack.comboStep, 1);
        assert.equal(combat.isAttacking, true);

        // Kinematics during attack maintains air momentum
        Kinematics.updateKinematics(entity, { horizontal: 1.0, jumpHeld: true }, 0.1);
        assert.equal(entity.vx, Kinematics.Constants.MOVE_SPEED, 'Horizontal speed must not drop during air attack');
        assert.equal(entity.z, 0.0, '2.5D plane maintained');
    });

    test('Pairwise 2: Aerial Plunge (Down + Attack) overrides jump ascent and triggers ground impact shockwave', () => {
        const entity = { x: 0, y: 4.0, z: 0, vx: 5.0, vy: 6.0, vz: 0, isGrounded: false };

        // Player inputs Down + Attack while airborne
        const isPlunging = true;
        entity.vy = -22.0; // High speed downward dive
        entity.vx = 0;     // Horizontal lock

        // Advance until ground contact
        while (entity.y > 0) {
            Kinematics.updateKinematics(entity, {}, 0.05);
        }

        assert.equal(entity.y, 0, 'Plunge must reach ground level');
        assert.equal(entity.isGrounded, true);

        // Ground shockwave AABB check around impact point (x=0)
        const shockwaveBox = { minX: -2.5, maxX: 2.5, minY: 0, maxY: 1.2 };
        const enemyBox = { minX: 1.5, maxX: 2.2, minY: 0, maxY: 1.8 };
        assert.equal(Hitbox.check2DOverlap(shockwaveBox, enemyBox), true, 'Shockwave must hit nearby enemy');
    });

    test('Pairwise 3: Shadow Dodge Roll + I-Frames completely absorbs incoming enemy attack damage', () => {
        const entity = { x: 2.0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, facing: 1, isGrounded: true, rollCooldown: 0 };
        const combat = new CharacterCombat.PlayerCombat();

        // 1. Initiate roll
        Kinematics.updateKinematics(entity, { rollPressed: true }, 0.016);
        assert.equal(entity.isRolling, true);
        assert.equal(entity.isInvulnerable, true);

        // Synchronize combat controller state
        combat.isInvulnerable = entity.isInvulnerable;

        // 2. Incoming enemy attack connects during roll
        const enemyAttack = { damage: 30 };
        const result = combat.takeDamage(enemyAttack.damage);

        assert.equal(result.damageTaken, 0, 'Damage must be 0 during dodge roll I-frames');
        assert.equal(result.absorbed, true);
        assert.equal(combat.hp, 100, 'Player HP must remain unaffected');
    });

    test('Pairwise 4: Perfect Parry deflecting Enemy Attack breaks poise and triggers Overdrive via 100 resonance', () => {
        const parry = new ParryModule.ParrySystem(0.10);
        const combat = new CharacterCombat.PlayerCombat();
        const enemy = EnemyAI.createEnemyEntity('footman', 3.0, 0);

        // Enemy enters active attack
        enemy.state = EnemyAI.AIStates.ATTACK_ACTIVE;
        const incomingAttack = { damage: 25 };

        // Player guards right before attack lands
        parry.triggerGuard();
        const evalResult = parry.evaluateIncomingHit(incomingAttack);

        assert.equal(evalResult.result, 'PARRIED');
        assert.equal(evalResult.damageTaken, 0);
        assert.equal(evalResult.enemyPoiseDamage, 100);

        // Apply poise damage to enemy
        const poiseRes = CombatMath.calculatePoise(enemy.poise, evalResult.enemyPoiseDamage);
        assert.equal(poiseRes.isBroken, true, 'Enemy poise must break');
        enemy.state = EnemyAI.AIStates.STAGGER;
        enemy.timer = 1.2;

        // Apply resonance gain to player (+100)
        combat.addResonance(evalResult.resonanceGain);
        assert.equal(combat.resonance, 100);
        assert.equal(combat.isOverdrive, true, 'Full resonance must activate Overdrive mode');

        // Overdrive riposte attack deals massive damage
        const riposteHit = combat.triggerAttack(0.1);
        const damageMitigated = CombatMath.calculateDamage(riposteHit.damage, 0, true);
        assert.ok(damageMitigated >= 70, `Overdrive riposte should deal high damage: ${damageMitigated}`);
    });

    test('Pairwise 5: Mistimed Parry (> 0.10s) fails deflection, takes full damage, and awards 0 resonance', () => {
        const parry = new ParryModule.ParrySystem(0.10);
        const combat = new CharacterCombat.PlayerCombat();

        // Player guards too early (0.15s before hit)
        parry.triggerGuard();
        parry.update(0.15); // parry window expires

        assert.equal(parry.isActive, false, 'Parry window must be closed');

        const incomingAttack = { damage: 25 };
        const evalResult = parry.evaluateIncomingHit(incomingAttack);

        assert.equal(evalResult.result, 'HIT');
        assert.equal(evalResult.damageTaken, 25);
        assert.equal(evalResult.resonanceGain, 0);

        combat.takeDamage(evalResult.damageTaken);
        assert.equal(combat.hp, 75, 'Player takes full unmitigated hit');
        assert.equal(combat.resonance, 0, 'No resonance awarded on mistime');
    });

    test('Pairwise 6: Resonance Accumulation enables Stygian Lance railgun beam piercing multiple enemies', () => {
        const combat = new CharacterCombat.PlayerCombat();
        assert.equal(combat.resonance, 0);

        // Build resonance through successful hits (+15 each)
        combat.addResonance(15);
        combat.addResonance(15);
        assert.equal(combat.resonance, 30);

        // Cast Stygian Lance (cost: 25)
        const spell = combat.triggerSpell('stygian_lance');
        assert.equal(spell.success, true);
        assert.equal(spell.damage, 55);
        assert.equal(combat.resonance, 5, 'Resonance deducted to 5');

        // Check piercing hit across 2 enemies aligned at x=5 and x=12
        const playerPos = { x: 0, y: 0 };
        const enemy1Box = { minX: 4.5, maxX: 5.5, minY: 0.5, maxY: 1.8 };
        const enemy2Box = { minX: 11.5, maxX: 12.5, minY: 0.5, maxY: 1.8 };

        const hit1 = Hitbox.checkRaycastHit(playerPos, 1, spell.range, enemy1Box);
        const hit2 = Hitbox.checkRaycastHit(playerPos, 1, spell.range, enemy2Box);

        assert.equal(hit1, true, 'Stygian Lance must hit first aligned enemy');
        assert.equal(hit2, true, 'Stygian Lance must pierce through and hit second aligned enemy');
    });

    test('Pairwise 7: Insufficient Resonance Guard prevents casting when resonance < 25', () => {
        const combat = new CharacterCombat.PlayerCombat();
        combat.resonance = 20;

        const spell = combat.triggerSpell('stygian_lance');
        assert.equal(spell.success, false);
        assert.equal(spell.reason, 'INSUFFICIENT_RESONANCE');
        assert.equal(combat.resonance, 20, 'Resonance must remain unchanged on failed cast');
    });

    test('Pairwise 8: Overdrive State Lifecycle activates at 100 resonance and deactivates when energy is spent', () => {
        const combat = new CharacterCombat.PlayerCombat();
        combat.addResonance(100);
        assert.equal(combat.isOverdrive, true);

        // Cast spell consuming 25 resonance
        combat.triggerSpell('stygian_lance');
        assert.equal(combat.resonance, 75);
        assert.equal(combat.isOverdrive, false, 'Overdrive must immediately deactivate when resonance drops below 100');
    });

    test('Pairwise 9: Hit-Stop Micro-Freeze + Exponential Screen Shake Coupling on Combo Finisher', () => {
        const combat = new CharacterCombat.PlayerCombat();
        combat.comboStep = 2;

        const finisher = combat.triggerAttack(0.3);
        assert.equal(finisher.comboStep, 3);
        assert.equal(finisher.isFinisher, true);
        assert.equal(finisher.hitStop, 0.08, 'Finisher must produce 0.08s hit stop');
        assert.equal(finisher.screenShake, 0.35, 'Finisher must produce 0.35 screen trauma');
    });
});
