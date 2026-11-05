/**
 * Vaelthorn: The Oath of Darkness
 * Module: Enemy AI Finite State Machine (enemy_ai_fsm.js)
 * 
 * Implements deterministic Moore/Mealy state machines for enemy entities:
 * - Ashen Footman (Melee Grunt with telegraphed strikes)
 * - Cinder-Bough Archer (Ranged Sniper with ballistic arcs and evasive rolls)
 * - The Iron Phalanx (Heavy Tower Shield Juggernaut)
 * - Training Dummy (Interactive target with damage feedback and auto-revive)
 */

const AIStates = {
    IDLE: 'IDLE',
    PATROL: 'PATROL',
    AGGRO: 'AGGRO',
    ATTACK_WINDUP: 'ATTACK_WINDUP',
    ATTACK_ACTIVE: 'ATTACK_ACTIVE',
    ATTACK_RECOVERY: 'ATTACK_RECOVERY',
    STAGGER: 'STAGGER',
    DEFEATED: 'DEFEATED'
};

/**
 * Factory for creating configured enemy entities
 */
function createEnemyEntity(type = 'footman', initialX = 10, initialY = 0) {
    const isPhalanx = type === 'phalanx';
    const isArcher = type === 'archer';
    const baseHp = isPhalanx ? 120 : (isArcher ? 60 : 80);
    const basePoise = isPhalanx ? 150 : 80;

    return {
        id: `enemy_${Math.random().toString(36).substring(2, 7)}`,
        type,
        x: initialX,
        y: initialY,
        z: 0.0,
        vx: 0,
        vy: 0,
        facing: -1,
        hp: baseHp,
        maxHp: baseHp,
        poise: basePoise,
        maxPoise: basePoise,
        state: AIStates.PATROL,
        timer: 0,
        telegraphActive: false,
        activeHitbox: null,
        cooldown: 0,
        hasShield: isPhalanx,
        shieldActive: isPhalanx,
        staggerDuration: 1.0,
        patrolMinX: initialX - 4.0,
        patrolMaxX: initialX + 4.0
    };
}

/**
 * Updates an enemy entity through the deterministic state machine
 * @param {Object} enemy - The enemy state container
 * @param {Object} player - The player position and state { x, y, hp, isDead }
 * @param {number} dt - Delta time in seconds
 */
function updateEnemyFSM(enemy, player, dt) {
    // 1. Guard against negative dt
    dt = Math.max(0, dt);

    // 2. Health & Defeat Check
    if (enemy.hp <= 0 && enemy.state !== AIStates.DEFEATED) {
        enemy.state = AIStates.DEFEATED;
        enemy.vx = 0;
        enemy.activeHitbox = null;
        enemy.telegraphActive = false;
        return { state: AIStates.DEFEATED, event: 'DEFEAT' };
    }

    if (enemy.state === AIStates.DEFEATED) {
        return { state: AIStates.DEFEATED, isDead: true };
    }

    // 3. Cooldown decay
    if (enemy.cooldown > 0) {
        enemy.cooldown = Math.max(0, enemy.cooldown - dt);
    }

    // 4. Directional orientation toward player
    const dist = Math.abs(enemy.x - player.x);
    if (enemy.state !== AIStates.STAGGER && enemy.state !== AIStates.ATTACK_ACTIVE) {
        enemy.facing = (player.x > enemy.x) ? 1 : -1;
    }

    // 5. State Machine Dispatch
    switch (enemy.state) {
        case AIStates.PATROL:
        case AIStates.IDLE:
            if (dist <= 8.0) {
                enemy.state = AIStates.AGGRO;
                enemy.vx = 0;
            } else {
                // Gentle patrol back and forth
                enemy.vx = enemy.facing * 2.0;
                enemy.x += enemy.vx * dt;
                if (enemy.x <= enemy.patrolMinX) enemy.facing = 1;
                if (enemy.x >= enemy.patrolMaxX) enemy.facing = -1;
            }
            break;

        case AIStates.AGGRO:
            if (enemy.type === 'archer') {
                if (dist > 4.0 && dist <= 12.0 && enemy.cooldown <= 0) {
                    enemy.state = AIStates.ATTACK_WINDUP;
                    enemy.timer = 0.40; // 0.4s telegraph
                    enemy.telegraphActive = true;
                    enemy.vx = 0;
                } else if (dist <= 2.5) {
                    // Evasive roll away from approaching player
                    enemy.vx = -enemy.facing * 6.0;
                    enemy.x += enemy.vx * dt;
                } else {
                    enemy.vx = enemy.facing * 3.0;
                    enemy.x += enemy.vx * dt;
                }
            } else {
                // Melee (Ashen Footman, Iron Phalanx)
                if (dist <= 2.2 && enemy.cooldown <= 0) {
                    enemy.state = AIStates.ATTACK_WINDUP;
                    enemy.timer = 0.30; // 0.3s weapon glint telegraph
                    enemy.telegraphActive = true;
                    enemy.vx = 0;
                } else {
                    enemy.vx = enemy.facing * 4.0;
                    enemy.x += enemy.vx * dt;
                }
            }
            break;

        case AIStates.ATTACK_WINDUP:
            enemy.timer -= dt;
            if (enemy.timer <= 0) {
                enemy.state = AIStates.ATTACK_ACTIVE;
                enemy.timer = 0.20;
                enemy.telegraphActive = false;
                const reach = enemy.type === 'archer' ? 12.0 : 2.2;
                enemy.activeHitbox = {
                    minX: enemy.facing > 0 ? enemy.x : enemy.x - reach,
                    maxX: enemy.facing > 0 ? enemy.x + reach : enemy.x,
                    minY: enemy.y - 0.2,
                    maxY: enemy.y + 1.8,
                    damage: enemy.type === 'archer' ? 25 : 20,
                    isRanged: enemy.type === 'archer'
                };
            }
            break;

        case AIStates.ATTACK_ACTIVE:
            enemy.timer -= dt;
            if (enemy.timer <= 0) {
                enemy.state = AIStates.ATTACK_RECOVERY;
                enemy.timer = 0.35;
                enemy.activeHitbox = null;
            }
            break;

        case AIStates.ATTACK_RECOVERY:
            enemy.timer -= dt;
            if (enemy.timer <= 0) {
                enemy.state = AIStates.AGGRO;
                enemy.cooldown = 0.90;
            }
            break;

        case AIStates.STAGGER:
            enemy.timer -= dt;
            enemy.activeHitbox = null;
            enemy.telegraphActive = false;
            enemy.vx = 0;
            if (enemy.timer <= 0) {
                enemy.state = AIStates.AGGRO;
                enemy.poise = enemy.maxPoise;
            }
            break;
    }

    return {
        state: enemy.state,
        telegraphActive: enemy.telegraphActive,
        activeHitbox: enemy.activeHitbox,
        vx: enemy.vx,
        facing: enemy.facing
    };
}

module.exports = {
    AIStates,
    createEnemyEntity,
    updateEnemyFSM
};
