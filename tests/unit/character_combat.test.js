/**
 * Unit Test Suite: Character Combat Controller
 * File: tests/unit/character_combat.test.js
 * 
 * Comprehensive tests for:
 * - 10-state deterministic player combat state machine
 * - 3-hit combo buffer & reset timing engine
 * - Micro-freeze hit-stop scheduling (0.04s light, 0.08s finisher)
 * - Three distinct weapon profiles (Longsword, Great-Mace with Hyper-Armor, Twin Daggers)
 * - Universal health container with overkill protection & 0.30s post-damage I-frames
 * - Stygian Resonance economy, Overdrive mode (+30% damage), and spell execution
 * - Stygian Lance 16m piercing beam with zero-duplicate hit suppression
 * - Guard stance & parry system delegation
 */

const { describe, test, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const {
    CombatStates,
    WEAPON_PROFILES,
    DEFAULT_COMBAT_CONFIG,
    PlayerCombat
} = require('../../src/engine/character_combat.js');

const Hitbox = require('../../src/engine/hitbox.js');

describe('Character Combat Controller Unit Test Suite', () => {

    // ========================================================================
    // 1. INSTANTIATION & DEFAULT STATE
    // ========================================================================
    describe('1. Instantiation, Default State & Weapon Setup', () => {
        let combat;

        beforeEach(() => {
            combat = new PlayerCombat();
        });

        test('initializes with 100 HP, 0 resonance, IDLE state, and Penumbra Longsword', () => {
            assert.equal(combat.hp, 100);
            assert.equal(combat.maxHp, 100);
            assert.equal(combat.resonance, 0);
            assert.equal(combat.maxResonance, 100);
            assert.equal(combat.isOverdrive, false);
            assert.equal(combat.state, CombatStates.IDLE);
            assert.equal(combat.comboStep, 0);
            assert.equal(combat.isAttacking, false);
            assert.equal(combat.isInvulnerable, false);
            assert.equal(combat.currentWeapon.id, 'penumbra_longsword');
        });

        test('CombatStates enum contains all 10 deterministic states', () => {
            const expectedStates = [
                'IDLE', 'MOVE', 'ATTACK_1', 'ATTACK_2', 'ATTACK_3',
                'GUARD', 'DODGE_ROLL', 'SPELL_CAST', 'HIT_STUN', 'DEAD'
            ];
            for (const state of expectedStates) {
                assert.ok(CombatStates[state] !== undefined, `State ${state} must be defined`);
                assert.equal(CombatStates[state], state);
            }
        });

        test('WEAPON_PROFILES contains Longsword, Great-Mace, and Twin Daggers', () => {
            assert.ok(WEAPON_PROFILES.PENUMBRA_LONGSWORD !== undefined);
            assert.ok(WEAPON_PROFILES.GREAT_MACE !== undefined);
            assert.ok(WEAPON_PROFILES.TWIN_DAGGERS !== undefined);
        });
    });

    // ========================================================================
    // 2. 3-HIT COMBO BUFFER & ADVANCEMENT SEQUENCE
    // ========================================================================
    describe('2. 3-Hit Combo Buffer & Advancement Sequence', () => {
        let combat;

        beforeEach(() => {
            combat = new PlayerCombat();
        });

        test('executes 3-hit combo sequence with damages [22, 28, 48]', () => {
            // Swing 1
            const hit1 = combat.triggerAttack(0.0);
            assert.equal(hit1.comboStep, 1);
            assert.equal(hit1.damage, 22);
            assert.equal(hit1.isFinisher, false);
            assert.equal(combat.state, CombatStates.ATTACK_1);
            assert.equal(combat.isAttacking, true);

            // Allow swing 1 to finish
            combat.attackTimer = 0;

            // Swing 2
            const hit2 = combat.triggerAttack(0.25);
            assert.equal(hit2.comboStep, 2);
            assert.equal(hit2.damage, 28);
            assert.equal(hit2.isFinisher, false);
            assert.equal(combat.state, CombatStates.ATTACK_2);

            // Allow swing 2 to finish
            combat.attackTimer = 0;

            // Swing 3 (Finisher)
            const hit3 = combat.triggerAttack(0.50);
            assert.equal(hit3.comboStep, 3);
            assert.equal(hit3.damage, 48);
            assert.equal(hit3.isFinisher, true);
            assert.equal(combat.state, CombatStates.ATTACK_3);
        });

        test('cycles back to Hit 1 after completing finisher (Hit 3)', () => {
            combat.triggerAttack(0.0);
            combat.attackTimer = 0;
            combat.triggerAttack(0.25);
            combat.attackTimer = 0;
            combat.triggerAttack(0.50); // Finisher
            combat.attackTimer = 0;

            // Next swing loops back to 1
            const hit4 = combat.triggerAttack(0.75);
            assert.equal(hit4.comboStep, 1);
            assert.equal(hit4.damage, 22);
            assert.equal(hit4.isFinisher, false);
            assert.equal(combat.state, CombatStates.ATTACK_1);
        });
    });

    // ========================================================================
    // 3. COMBO RESET TIMING & IDLE TIMEOUT
    // ========================================================================
    describe('3. Combo Reset Timing & Idle Expiration', () => {
        let combat;

        beforeEach(() => {
            combat = new PlayerCombat();
        });

        test('advances combo within 0.65s reset window', () => {
            combat.triggerAttack(0.0);
            combat.attackTimer = 0;

            // dt = 0.40s <= 0.65s
            const hitAdv = combat.triggerAttack(0.40);
            assert.equal(hitAdv.comboStep, 2);
        });

        test('resets combo to Hit 1 when idle exceeds 0.65s', () => {
            combat.triggerAttack(0.0);
            combat.attackTimer = 0;
            combat.triggerAttack(0.20); // Step 2
            combat.attackTimer = 0;

            // Idle for 0.70s (0.90s - 0.20s = 0.70s > 0.65s)
            const hitReset = combat.triggerAttack(0.90);
            assert.equal(hitReset.comboStep, 1, 'Combo must reset to Hit 1 after 0.65s idle');
            assert.equal(hitReset.damage, 22);
        });
    });

    // ========================================================================
    // 4. INPUT BUFFERING & RAPID SPAMMING LOCKOUT
    // ========================================================================
    describe('4. Input Buffering & Rapid Spamming Lockout', () => {
        let combat;

        beforeEach(() => {
            combat = new PlayerCombat();
        });

        test('rejects rapid attack inputs while attackTimer > 0.08s (lockout zone)', () => {
            const hit1 = combat.triggerAttack(0.0);
            assert.equal(hit1.comboStep, 1);
            assert.equal(combat.attackTimer, 0.22);

            // Spam 10 calls during early active swing
            for (let i = 0; i < 10; i++) {
                const spammed = combat.triggerAttack(0.005 * (i + 1));
                assert.equal(spammed, null, 'Input must be rejected during lockout window');
            }
            assert.equal(combat.comboStep, 1, 'Combo step must remain 1 during lockout');
        });

        test('allows attack input once attackTimer decays into buffer window (<= 0.08s)', () => {
            combat.triggerAttack(0.0);
            // Simulate 0.15s of swing (0.22s - 0.15s = 0.07s remaining <= 0.08s)
            combat.update(0.15);
            assert.ok(combat.attackTimer <= 0.08);

            const hit2 = combat.triggerAttack(0.15);
            assert.ok(hit2 !== null);
            assert.equal(hit2.comboStep, 2);
        });
    });

    // ========================================================================
    // 5. HIT-STOP SCHEDULING & MICRO-FREEZE
    // ========================================================================
    describe('5. Hit-Stop Scheduler & Freeze Invariance', () => {
        let combat;

        beforeEach(() => {
            combat = new PlayerCombat();
        });

        test('schedules 0.04s hit-stop for light hits and 0.08s for finisher', () => {
            const hit1 = combat.triggerAttack(0.0);
            assert.equal(hit1.hitStop, 0.04);

            combat.attackTimer = 0;
            const hit2 = combat.triggerAttack(0.25);
            assert.equal(hit2.hitStop, 0.04);

            combat.attackTimer = 0;
            const hit3 = combat.triggerAttack(0.50);
            assert.equal(hit3.hitStop, 0.08);
        });

        test('update() decrements hitStopTimer and freezes combat timers during hit-stop', () => {
            combat.triggerAttack(0.0);
            const initialAttackTimer = combat.attackTimer;
            combat.hitStopTimer = 0.08;

            // 0.04s update while hitStopTimer is active
            combat.update(0.04);
            assert.ok(Math.abs(combat.hitStopTimer - 0.04) < 1e-4);
            assert.equal(combat.attackTimer, initialAttackTimer, 'Attack timer must freeze during hit-stop');

            // Remaining 0.04s update
            combat.update(0.04);
            assert.equal(combat.hitStopTimer, 0.0);
            assert.equal(combat.attackTimer, initialAttackTimer, 'Attack timer remains frozen on exit frame');

            // Next update unfreezes and decrements attack timer
            combat.update(0.05);
            assert.ok(combat.attackTimer < initialAttackTimer);
        });
    });

    // ========================================================================
    // 6. WEAPON PROFILES (LONGSWORD, GREAT-MACE, TWIN DAGGERS)
    // ========================================================================
    describe('6. Weapon Profiles (Longsword, Great-Mace, Twin Daggers)', () => {
        let combat;

        beforeEach(() => {
            combat = new PlayerCombat();
        });

        test('swaps to Executioner Great-Mace with damages [35, 45, 75] and Hyper-Armor', () => {
            combat.equipWeapon('GREAT_MACE');
            assert.equal(combat.currentWeapon.id, 'great_mace');
            assert.equal(combat.currentWeapon.hasHyperArmor, true);

            const hit1 = combat.triggerAttack(0.0);
            assert.equal(hit1.damage, 35);
            assert.equal(hit1.reach, 2.6);

            combat.attackTimer = 0;
            const hit2 = combat.triggerAttack(0.40);
            assert.equal(hit2.damage, 45);

            combat.attackTimer = 0;
            const hit3 = combat.triggerAttack(0.80);
            assert.equal(hit3.damage, 75);
            assert.equal(hit3.isFinisher, true);
        });

        test('swaps to Twin Eclipse Daggers with damages [14, 18, 32] and +25 resonance/hit', () => {
            combat.equipWeapon('TWIN_DAGGERS');
            assert.equal(combat.currentWeapon.id, 'twin_daggers');
            assert.equal(combat.currentWeapon.hasHyperArmor, false);
            assert.equal(combat.currentWeapon.resonanceGain, 25);

            const hit1 = combat.triggerAttack(0.0);
            assert.equal(hit1.damage, 14);
            assert.equal(hit1.resonanceGain, 25);

            combat.attackTimer = 0;
            const hit2 = combat.triggerAttack(0.20);
            assert.equal(hit2.damage, 18);

            combat.attackTimer = 0;
            const hit3 = combat.triggerAttack(0.40);
            assert.equal(hit3.damage, 32);
        });

        test('equipWeapon safely defaults to Penumbra Longsword for unknown input', () => {
            combat.equipWeapon('UNKNOWN_WEAPON');
            assert.equal(combat.currentWeapon.id, 'penumbra_longsword');
        });
    });

    // ========================================================================
    // 7. HYPER-ARMOR MECHANICS
    // ========================================================================
    describe('7. Hyper-Armor Mechanics', () => {
        test('Great-Mace Hyper-Armor prevents HIT_STUN during active attack swing', () => {
            const combat = new PlayerCombat();
            combat.equipWeapon('GREAT_MACE');
            combat.triggerAttack(0.0);
            assert.equal(combat.isAttacking, true);
            assert.equal(combat.state, CombatStates.ATTACK_1);

            // Receive damage during swing
            const res = combat.takeDamage(20);
            assert.equal(res.damageTaken, 20);
            assert.equal(combat.hp, 80);
            // Swing must NOT be interrupted to HIT_STUN
            assert.equal(combat.state, CombatStates.ATTACK_1, 'Hyper-armor must prevent HIT_STUN');
            assert.equal(combat.isAttacking, true, 'Swing must continue uninterrupted');
        });

        test('Longsword without Hyper-Armor transitions to HIT_STUN upon receiving damage', () => {
            const combat = new PlayerCombat();
            combat.equipWeapon('PENUMBRA_LONGSWORD');
            combat.triggerAttack(0.0);

            const res = combat.takeDamage(20);
            assert.equal(res.damageTaken, 20);
            assert.equal(combat.hp, 80);
            assert.equal(combat.state, CombatStates.HIT_STUN, 'Must transition to HIT_STUN');
            assert.equal(combat.isAttacking, false, 'Swing must be canceled by hit-stun');
        });
    });

    // ========================================================================
    // 8. UNIVERSAL HEALTH CONTAINER & LETHAL CLAMPING
    // ========================================================================
    describe('8. Universal Health Container & Lethal Clamping', () => {
        let combat;

        beforeEach(() => {
            combat = new PlayerCombat();
        });

        test('overkill damage strictly clamps HP to 0 and triggers DEAD state', () => {
            combat.hp = 15;
            const res = combat.takeDamage(5000);
            assert.equal(combat.hp, 0);
            assert.equal(res.hpRemaining, 0);
            assert.equal(res.isDead, true);
            assert.equal(combat.state, CombatStates.DEAD);
        });

        test('taking damage while already at 0 HP deals 0 damage and returns isDead', () => {
            combat.hp = 0;
            const res = combat.takeDamage(50);
            assert.equal(res.damageTaken, 0);
            assert.equal(res.isDead, true);
            assert.equal(combat.hp, 0);
        });

        test('revive() restores health and returns entity to IDLE state', () => {
            combat.takeDamage(100);
            assert.equal(combat.state, CombatStates.DEAD);

            const rev = combat.revive(0.50);
            assert.equal(combat.hp, 50);
            assert.equal(rev.hp, 50);
            assert.equal(combat.state, CombatStates.IDLE);
            assert.equal(combat.isInvulnerable, false);
        });
    });

    // ========================================================================
    // 9. POST-DAMAGE INVULNERABILITY (I-FRAMES)
    // ========================================================================
    describe('9. Post-Damage Invincibility Frames (0.30s I-Frames)', () => {
        let combat;

        beforeEach(() => {
            combat = new PlayerCombat();
        });

        test('taking damage grants 0.30s I-frames and blocks consecutive damage', () => {
            combat.takeDamage(20);
            assert.equal(combat.hp, 80);
            assert.equal(combat.isInvulnerable, true);
            assert.equal(combat.invulnerabilityTimer, 0.30);

            // Immediate second hit
            const hit2 = combat.takeDamage(30);
            assert.equal(hit2.damageTaken, 0);
            assert.equal(hit2.absorbed, true);
            assert.equal(combat.hp, 80, 'HP must remain 80');
        });

        test('I-frames expire after 0.30s update', () => {
            combat.takeDamage(20);
            assert.equal(combat.isInvulnerable, true);

            combat.update(0.31);
            assert.equal(combat.isInvulnerable, false);

            const hit3 = combat.takeDamage(25);
            assert.equal(hit3.damageTaken, 25);
            assert.equal(combat.hp, 55);
        });
    });

    // ========================================================================
    // 10. HEALING & OVER-HEALING BOUNDARIES
    // ========================================================================
    describe('10. Healing & Over-Healing Boundaries', () => {
        let combat;

        beforeEach(() => {
            combat = new PlayerCombat();
        });

        test('healing clamps strictly to maxHp (100)', () => {
            combat.hp = 85;
            const res = combat.heal(40);
            assert.equal(combat.hp, 100);
            assert.equal(res.healed, 15);
        });

        test('dead entity cannot be healed', () => {
            combat.hp = 0;
            const res = combat.heal(50);
            assert.equal(res.healed, 0);
            assert.equal(combat.hp, 0);
        });
    });

    // ========================================================================
    // 11. STYGIAN RESONANCE, OVERDRIVE & SPELL ARSENAL
    // ========================================================================
    describe('11. Stygian Resonance, Overdrive & Spell Arsenal', () => {
        let combat;

        beforeEach(() => {
            combat = new PlayerCombat();
        });

        test('accumulates resonance up to 100 and enters Overdrive (+30% damage)', () => {
            combat.addResonance(50);
            assert.equal(combat.resonance, 50);
            assert.equal(combat.isOverdrive, false);

            combat.addResonance(50);
            assert.equal(combat.resonance, 100);
            assert.equal(combat.isOverdrive, true);

            // Melee damage receives +30% boost: round(22 * 1.30) = 29
            const hit = combat.triggerAttack(0.0);
            assert.equal(hit.damage, 29);
        });

        test('Stygian Lance consumes 25 resonance, exits Overdrive, and returns 55 damage', () => {
            combat.addResonance(100);
            assert.equal(combat.isOverdrive, true);

            const spell = combat.triggerSpell('stygian_lance');
            assert.equal(spell.success, true);
            assert.equal(spell.damage, 55);
            assert.equal(spell.range, 16.0);
            assert.equal(spell.isPiercing, true);
            assert.equal(combat.resonance, 75);
            assert.equal(combat.isOverdrive, false, 'Overdrive must exit when resonance < 100');
        });

        test('Cinder Nova consumes 40 resonance and hits 4.0m radius', () => {
            combat.addResonance(60);
            const spell = combat.triggerSpell('cinder_nova');
            assert.equal(spell.success, true);
            assert.equal(spell.damage, 40);
            assert.equal(spell.radius, 4.0);
            assert.equal(combat.resonance, 20);
        });

        test('Aegis of Umbra consumes 30 resonance and absorbs next hit for +50 HP heal', () => {
            combat.addResonance(50);
            const spell = combat.triggerSpell('aegis_of_umbra');
            assert.equal(spell.success, true);
            assert.equal(combat.aegisShieldActive, true);
            assert.equal(combat.resonance, 20);

            combat.hp = 40;
            const hit = combat.takeDamage(45);
            assert.equal(hit.damageTaken, 0);
            assert.equal(hit.aegisHealed, 50);
            assert.equal(combat.hp, 90);
            assert.equal(combat.aegisShieldActive, false);
        });

        test('rejects spells when resonance is insufficient', () => {
            combat.resonance = 15;
            const spell = combat.triggerSpell('stygian_lance');
            assert.equal(spell.success, false);
            assert.equal(spell.reason, 'INSUFFICIENT_RESONANCE');
            assert.equal(combat.resonance, 15);
        });

        test('resonance decays out-of-combat after 4.0s idle delay', () => {
            combat.addResonance(50);
            assert.equal(combat.resonance, 50);

            // 3.0s idle: no decay
            combat.update(3.0);
            assert.equal(combat.resonance, 50);

            // Exceeds 4.0s: decays at 5.0 units/s
            combat.update(2.0); // 1.0s of active decay
            assert.ok(combat.resonance < 50);
        });
    });

    // ========================================================================
    // 12. HITBOX BOUNDS & DUPLICATE HIT SUPPRESSION
    // ========================================================================
    describe('12. Hitbox Bounds Calculation & Duplicate Suppression', () => {
        let combat;

        beforeEach(() => {
            combat = new PlayerCombat();
        });

        test('getActiveHitbox() returns valid AABB matching current reach and damage', () => {
            combat.triggerAttack(0.0);
            const box = combat.getActiveHitbox({ x: 5.0, y: 0.0 }, 1);
            assert.ok(box !== null);
            assert.equal(box.minX, 5.0);
            assert.equal(box.maxX, 5.0 + 2.4); // 2.4m reach
            assert.equal(box.damage, 22);
            assert.equal(box.comboStep, 1);
        });

        test('getActiveHitbox() returns null when not attacking', () => {
            assert.equal(combat.getActiveHitbox({ x: 0, y: 0 }, 1), null);
        });

        test('registerTargetHit() suppresses duplicate hits in same swing', () => {
            combat.triggerAttack(0.0);
            assert.equal(combat.registerTargetHit('enemy_1'), true);
            assert.equal(combat.registerTargetHit('enemy_1'), false, 'Duplicate hit must be suppressed');
            assert.equal(combat.registerTargetHit('enemy_2'), true);
        });
    });

    // ========================================================================
    // 13. STYGIAN LANCE PIERCING BEAM EXECUTION
    // ========================================================================
    describe('13. Stygian Lance Piercing Beam Execution', () => {
        let combat;

        beforeEach(() => {
            combat = new PlayerCombat();
            combat.addResonance(50);
        });

        test('executeStygianLance() pierces multiple aligned enemies along 16m line-of-fire', () => {
            const playerPos = { x: 0, y: 0 };
            const targets = [
                { id: 'grunt_1', x: 4.0, y: 0, width: 1.0, height: 1.8 },
                { id: 'archer_2', x: 10.0, y: 0, width: 1.0, height: 1.8 },
                { id: 'boss_3', x: 15.0, y: 0, width: 2.0, height: 2.5 },
                { id: 'out_of_range', x: 25.0, y: 0, width: 1.0, height: 1.8 }
            ];

            const result = combat.executeStygianLance(playerPos, 1, targets);
            assert.equal(result.success, true);
            assert.equal(result.hitCount, 3, 'Must pierce 3 aligned enemies within 16m');
            assert.equal(result.hits[0].targetId, 'grunt_1');
            assert.equal(result.hits[1].targetId, 'archer_2');
            assert.equal(result.hits[2].targetId, 'boss_3');
            assert.equal(result.hits[0].damage, 55);
            assert.equal(result.hits[0].knockback.vx, 6.0);
        });
    });

    // ========================================================================
    // 14. GUARD & PARRY DELEGATION
    // ========================================================================
    describe('14. Guard & Parry Delegation', () => {
        let combat;

        beforeEach(() => {
            combat = new PlayerCombat();
        });

        test('triggerGuard() enters GUARD state and initiates parry window', () => {
            const guarded = combat.triggerGuard();
            assert.equal(guarded, true);
            assert.equal(combat.state, CombatStates.GUARD);
            assert.equal(combat.parrySystem.isActive, true);
        });

        test('exits GUARD state when parry window expires', () => {
            combat.triggerGuard();
            combat.update(0.12);
            assert.equal(combat.parrySystem.isActive, false);
            assert.equal(combat.state, CombatStates.IDLE);
        });
    });
});
