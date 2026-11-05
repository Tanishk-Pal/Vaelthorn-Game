/**
 * Vaelthorn: The Oath of Darkness
 * Module: Boss Encounter Controller (boss_encounter.js)
 * 
 * Implements the multi-phase boss mechanics for:
 * Boss 1: Vael-Krag, The Weeping Gatekeeper
 * 
 * Phase 1 (100% - 50% HP):
 * - Massive Bell Sweeps (radius 4.5m)
 * - Ground Seismic Shockwaves traveling across the floor (requires jumping)
 * 
 * Phase 2 (50% - 0% HP):
 * - Violet Stygian Fire Bell (increased damage and speed)
 * - Airborne Leap Slam leaving burning ground hazard pools
 * - Violet Sweeping Arc with expanded reach
 */

class VaelKragBoss {
    constructor(initialX = 14, initialY = 0) {
        this.name = 'Vael-Krag, The Weeping Gatekeeper';
        this.x = initialX;
        this.y = initialY;
        this.z = 0.0;
        this.vx = 0;
        this.vy = 0;
        this.hp = 400;
        this.maxHp = 400;
        this.phase = 1;
        this.state = 'IDLE';
        this.facing = -1;
        this.timer = 0;
        this.cooldown = 1.0;
        this.activeHitbox = null;
        this.burningPools = [];
        this.shockwaves = [];
        this.targetX = null;
    }

    takeDamage(amount) {
        const dmg = Math.max(0, amount);
        this.hp = Math.max(0, this.hp - dmg);

        // Phase 2 transition triggered at 50% HP
        if (this.hp <= 200 && this.phase === 1) {
            this.triggerPhase2Transition();
        }

        return {
            hp: this.hp,
            maxHp: this.maxHp,
            phase: this.phase,
            isDead: this.hp <= 0
        };
    }

    triggerPhase2Transition() {
        this.phase = 2;
        this.state = 'PHASE_TRANSITION';
        this.timer = 1.2;
        this.activeHitbox = null;
    }

    update(dt, player = { x: 0, y: 0, hp: 100 }) {
        dt = Math.max(0, dt);

        if (this.hp <= 0) {
            this.state = 'DEFEATED';
            this.activeHitbox = null;
            return { state: 'DEFEATED', isDead: true, hp: 0 };
        }

        // 1. Decay and clean up burning ground pools
        for (let i = this.burningPools.length - 1; i >= 0; i--) {
            this.burningPools[i].duration -= dt;
            if (this.burningPools[i].duration <= 0) {
                this.burningPools.splice(i, 1);
            }
        }

        // 2. Advance and clean up floor shockwaves
        for (let i = this.shockwaves.length - 1; i >= 0; i--) {
            this.shockwaves[i].x += this.shockwaves[i].vx * dt;
            this.shockwaves[i].lifespan -= dt;
            if (this.shockwaves[i].lifespan <= 0) {
                this.shockwaves.splice(i, 1);
            }
        }

        // 3. Attack cooldown
        if (this.cooldown > 0) {
            this.cooldown = Math.max(0, this.cooldown - dt);
        }

        // 4. Directional facing
        if (this.state === 'IDLE' || this.state === 'RECOVERY') {
            this.facing = player.x > this.x ? 1 : -1;
        }

        const dist = Math.abs(this.x - player.x);

        // 5. Phase Transition Roar / Bell Ignite
        if (this.state === 'PHASE_TRANSITION') {
            this.timer -= dt;
            if (this.timer <= 0) {
                this.state = 'IDLE';
                this.cooldown = 0.5;
            }
            return { state: this.state, phase: this.phase };
        }

        // 6. Combat State Machine
        if (this.state === 'IDLE') {
            if (this.cooldown <= 0) {
                if (this.phase === 1) {
                    if (dist <= 4.5) {
                        this.state = 'BELL_SWEEP_WINDUP';
                        this.timer = 0.50; // Telegraph swing
                    } else {
                        this.state = 'SEISMIC_SLAM_WINDUP';
                        this.timer = 0.70; // Telegraph floor slam
                    }
                } else {
                    // Phase 2: aggressive leaps and violet fire
                    if (dist > 7.0) {
                        this.state = 'LEAP_SLAM_WINDUP';
                        this.timer = 0.55;
                    } else {
                        this.state = 'VIOLET_SWEEP_WINDUP';
                        this.timer = 0.38;
                    }
                }
            }
        } else if (this.state === 'BELL_SWEEP_WINDUP') {
            this.timer -= dt;
            if (this.timer <= 0) {
                this.state = 'BELL_SWEEP_ACTIVE';
                this.timer = 0.25;
                this.activeHitbox = {
                    minX: this.facing > 0 ? this.x : this.x - 4.5,
                    maxX: this.facing > 0 ? this.x + 4.5 : this.x,
                    minY: this.y,
                    maxY: this.y + 2.5,
                    damage: 35
                };
            }
        } else if (this.state === 'BELL_SWEEP_ACTIVE') {
            this.timer -= dt;
            if (this.timer <= 0) {
                this.state = 'RECOVERY';
                this.timer = 0.60;
                this.activeHitbox = null;
            }
        } else if (this.state === 'SEISMIC_SLAM_WINDUP') {
            this.timer -= dt;
            if (this.timer <= 0) {
                this.state = 'RECOVERY';
                this.timer = 0.80;
                // Emit floor shockwave traveling at 10 m/s
                this.shockwaves.push({
                    x: this.x,
                    vx: this.facing * 10.0,
                    width: 1.0,
                    height: 0.6,
                    lifespan: 2.0,
                    damage: 30
                });
            }
        } else if (this.state === 'LEAP_SLAM_WINDUP') {
            this.timer -= dt;
            if (this.timer <= 0) {
                this.state = 'LEAP_SLAM_AIR';
                this.timer = 0.45;
                this.targetX = player.x;
            }
        } else if (this.state === 'LEAP_SLAM_AIR') {
            this.timer -= dt;
            if (this.timer <= 0) {
                this.x = this.targetX !== null ? this.targetX : player.x;
                this.state = 'RECOVERY';
                this.timer = 0.85;
                // Impact erupts a burning fire pool
                this.burningPools.push({
                    x: this.x - 2.0,
                    width: 4.0,
                    duration: 6.0,
                    damagePerSec: 15
                });
                this.activeHitbox = {
                    minX: this.x - 3.5,
                    maxX: this.x + 3.5,
                    minY: this.y,
                    maxY: this.y + 2.0,
                    damage: 50
                };
            }
        } else if (this.state === 'VIOLET_SWEEP_WINDUP') {
            this.timer -= dt;
            if (this.timer <= 0) {
                this.state = 'BELL_SWEEP_ACTIVE';
                this.timer = 0.25;
                this.activeHitbox = {
                    minX: this.facing > 0 ? this.x : this.x - 5.0,
                    maxX: this.facing > 0 ? this.x + 5.0 : this.x,
                    minY: this.y,
                    maxY: this.y + 2.5,
                    damage: 45
                };
            }
        } else if (this.state === 'RECOVERY') {
            this.timer -= dt;
            this.activeHitbox = null;
            if (this.timer <= 0) {
                this.state = 'IDLE';
                this.cooldown = 1.1;
            }
        }

        return {
            state: this.state,
            phase: this.phase,
            hp: this.hp,
            maxHp: this.maxHp,
            activeHitbox: this.activeHitbox,
            burningPools: this.burningPools,
            shockwaves: this.shockwaves
        };
    }
}

module.exports = {
    VaelKragBoss
};
