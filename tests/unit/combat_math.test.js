const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
    DEFAULT_COMBAT_CONFIG,
    Constants,
    getComboDamage,
    calculateDamageMitigation,
    calculateDamage,
    calculateRiposteDamage,
    applyDamage,
    createPoiseState,
    applyPoiseDamage,
    updatePoise,
    calculatePoise,
    createResonanceState,
    addResonance,
    spendResonance,
    updateResonance,
    calculateResonance,
    getTrajectoryPosition,
    getTrajectoryVelocity,
    getTrajectoryAngle,
    calculateTrajectoryApex,
    calculateFlightTime,
    solveLaunchVelocityForTime,
    solveLaunchVelocityForSpeed,
    sampleTrajectoryPoints,
    calculateTrajectory
} = require('../../src/engine/combat_math.js');

describe('Combat Math Unit Test Suite', () => {

    describe('Damage Formulas & Combo Scaling', () => {
        it('returns exact combo sequence damages: 22, 28, 48', () => {
            assert.equal(getComboDamage(1), 22);
            assert.equal(getComboDamage(2), 28);
            assert.equal(getComboDamage(3), 48);
            // Default fallback
            assert.equal(getComboDamage(0), 22);
            assert.equal(getComboDamage(4), 48);
        });

        it('calculates 2.5x critical riposte damage multiplier against staggered targets', () => {
            const hit1Normal = calculateRiposteDamage(22, false);
            assert.equal(hit1Normal.damage, 22);
            assert.equal(hit1Normal.isCritical, false);

            const hit1Riposte = calculateRiposteDamage(22, true);
            assert.equal(hit1Riposte.damage, 55);
            assert.equal(hit1Riposte.isCritical, true);

            const hit2Riposte = calculateRiposteDamage(28, true);
            assert.equal(hit2Riposte.damage, 70);

            const hit3Riposte = calculateRiposteDamage(48, true);
            assert.equal(hit3Riposte.damage, 120);

            const maceRiposte = calculateRiposteDamage(70, true);
            assert.equal(maceRiposte.damage, 175);
        });

        it('calculates defense mitigation with diminishing returns and minimum 1 chip damage', () => {
            // Defense = 0 -> 100% damage
            assert.equal(calculateDamageMitigation(22, 0), 22);

            // Defense = 50 -> 22 / 1.5 = 14.667 -> 15
            assert.equal(calculateDamageMitigation(22, 50), 15);

            // Defense = 100 -> 50% damage
            assert.equal(calculateDamageMitigation(22, 100), 11);
            assert.equal(calculateDamageMitigation(48, 100), 24);

            // Defense = 200 -> 33.3% damage (48 / 3 = 16)
            assert.equal(calculateDamageMitigation(48, 200), 16);

            // Defense = 300 -> 25% damage (48 / 4 = 12)
            assert.equal(calculateDamageMitigation(48, 300), 12);

            // Extreme defense -> guarantees minimum 1 chip damage
            assert.equal(calculateDamageMitigation(22, 10000), 1);
            assert.equal(calculateDamageMitigation(1, 500), 1);

            // Zero or negative raw damage -> 0
            assert.equal(calculateDamageMitigation(0, 100), 0);
            assert.equal(calculateDamageMitigation(-10, 50), 0);
        });

        it('handles negative defense (vulnerability / armor shred) up to 10x cap safely in calculateDamageMitigation', () => {
            // Defense = -50 -> 22 / 0.5 = 44 (2x damage)
            assert.equal(calculateDamageMitigation(22, -50), 44);

            // Defense = -90 -> 22 / 0.1 = 220 (10x cap)
            assert.equal(calculateDamageMitigation(22, -90), 220);

            // Defense = -200 (clamped to -90) -> no division by zero!
            assert.equal(calculateDamageMitigation(22, -200), 220);
        });

        it('evaluates calculateDamage helper with defense and riposte', () => {
            assert.equal(calculateDamage(50, 0), 50);
            assert.equal(calculateDamage(50, 100), 25);
            assert.equal(calculateDamage(50, 0, true), 125); // 50 * 2.5 = 125
            assert.equal(calculateDamage(70, 0, false, true), 105); // 70 * 1.5 = 105
            assert.equal(calculateDamage(50, 100000), 1); // Chip damage
        });
    });

    describe('Poise Damage & Stagger Thresholds', () => {
        it('depletes poise and triggers STAGGER state when poise reaches 0', () => {
            const state = createPoiseState(40, 15, 2.5); // Ashen Footman
            assert.equal(state.currentPoise, 40);
            assert.equal(state.isStaggered, false);

            // Hit 1: 15 poise dmg
            const r1 = applyPoiseDamage(state, 15);
            assert.equal(r1.currentPoise, 25);
            assert.equal(r1.isStaggered, false);
            assert.equal(r1.poiseBroken, false);

            // Hit 2: 20 poise dmg
            const r2 = applyPoiseDamage(state, 20);
            assert.equal(r2.currentPoise, 5);
            assert.equal(r2.isStaggered, false);

            // Hit 3: 15 poise dmg -> breaks poise!
            const r3 = applyPoiseDamage(state, 15);
            assert.equal(r3.currentPoise, 0);
            assert.equal(r3.isStaggered, true);
            assert.equal(r3.poiseBroken, true);
            assert.equal(state.staggerTimer, 1.2);
        });

        it('heavy cleave (80 poise dmg) breaks standard footman poise in 1 hit', () => {
            const state = createPoiseState(40);
            const res = applyPoiseDamage(state, 80);
            assert.equal(res.currentPoise, 0);
            assert.equal(res.isStaggered, true);
            assert.equal(res.poiseBroken, true);
        });

        it('recovers from stagger after duration expires, restoring full poise', () => {
            const state = createPoiseState(40);
            applyPoiseDamage(state, 40);
            assert.equal(state.isStaggered, true);

            // Tick 0.5s -> still staggered
            updatePoise(state, 0.5);
            assert.equal(state.isStaggered, true);
            assert.ok(Math.abs(state.staggerTimer - 0.7) < 1e-4);

            // Tick remaining 0.75s -> recovers
            updatePoise(state, 0.75);
            assert.equal(state.isStaggered, false);
            assert.equal(state.currentPoise, 40);
        });

        it('regenerates poise out-of-combat after regenDelay has elapsed', () => {
            const state = createPoiseState(100, 20, 3.0);
            applyPoiseDamage(state, 50);
            assert.equal(state.currentPoise, 50);

            // Within delay window (2.0s < 3.0s) -> no regen
            updatePoise(state, 2.0);
            assert.equal(state.currentPoise, 50);

            // Advance past delay (another 1.5s -> total 3.5s >= 3.0s; active regen = 3.5 - 3.0 = 0.5s @ 20 u/s = +10)
            updatePoise(state, 1.5);
            assert.ok(Math.abs(state.currentPoise - 60) < 1e-4);

            // Advance another 1.0s (full active regen: 1.0s @ 20 u/s = +20)
            updatePoise(state, 1.0);
            assert.ok(Math.abs(state.currentPoise - 80) < 1e-4);
        });

        it('evaluates calculatePoise helper function', () => {
            const p1 = calculatePoise(100, 30);
            assert.equal(p1.remainingPoise, 70);
            assert.equal(p1.isBroken, false);

            const p2 = calculatePoise(40, 50);
            assert.equal(p2.remainingPoise, 0);
            assert.equal(p2.isBroken, true);
        });
    });

    describe('Stygian Resonance Economy', () => {
        it('accumulates resonance up to 100 and enters Overdrive mode', () => {
            const state = createResonanceState(0, 100);
            assert.equal(state.current, 0);
            assert.equal(state.isOverdrive, false);

            addResonance(state, 15);
            assert.equal(state.current, 15);

            addResonance(state, 30);
            assert.equal(state.current, 45);

            // Perfect Parry burst (+100) -> capped at 100
            addResonance(state, 100);
            assert.equal(state.current, 100);
            assert.equal(state.isOverdrive, true);
        });

        it('spends resonance for Stygian Lance (cost 25) and exits Overdrive', () => {
            const state = createResonanceState(100, 100);
            assert.equal(state.isOverdrive, true);

            const spent = spendResonance(state, 25);
            assert.equal(spent, true);
            assert.equal(state.current, 75);
            assert.equal(state.isOverdrive, false);

            // Attempt to spend when insufficient energy
            const lowState = createResonanceState(20, 100);
            const failSpent = spendResonance(lowState, 25);
            assert.equal(failSpent, false);
            assert.equal(lowState.current, 20);
        });

        it('drains resonance out-of-combat after 4.0s idle delay at 5.0 u/s', () => {
            const state = createResonanceState(50, 100);

            // 3 seconds idle -> no decay
            updateResonance(state, 3.0);
            assert.equal(state.current, 50);

            // 1.5 more seconds (total 4.5s >= 4.0s delay; active decay = 4.5 - 4.0 = 0.5s @ 5.0 u/s = 2.5)
            updateResonance(state, 1.5);
            assert.ok(Math.abs(state.current - 47.5) < 1e-4);

            // 1.0 more second of active decay (1.0s @ 5.0 u/s = 5.0)
            updateResonance(state, 1.0);
            assert.ok(Math.abs(state.current - 42.5) < 1e-4);
        });

        it('evaluates calculateResonance helper function with underflow and overflow', () => {
            const underflow = calculateResonance(0, -50);
            assert.equal(underflow.resonance, 0);

            const overflow = calculateResonance(90, 50);
            assert.equal(overflow.resonance, 100);
            assert.equal(overflow.isOverdrive, true);

            const decay = calculateResonance(50, 0, 5.0, 1.0);
            assert.equal(decay.resonance, 45);
        });
    });

    describe('Parabolic Projectile Ballistics', () => {
        it('computes exact position and velocity at time t along parabolic arc', () => {
            const x0 = 0, y0 = 4;
            const vx0 = 12, vy0 = 9;
            const g = -26.0;

            const pos1 = getTrajectoryPosition(x0, y0, vx0, vy0, 1.0, g);
            assert.equal(pos1.x, 12.0);
            // y(1.0) = 4 + 9(1) - 0.5(26)(1)^2 = 4 + 9 - 13 = 0.0
            assert.equal(pos1.y, 0.0);
            assert.equal(pos1.z, 0.0);

            const vel1 = getTrajectoryVelocity(vx0, vy0, 1.0, g);
            assert.equal(vel1.vx, 12.0);
            // vy(1.0) = 9 - 26(1) = -17.0
            assert.equal(vel1.vy, -17.0);
            assert.equal(vel1.vz, 0.0);

            const ang1 = getTrajectoryAngle(vx0, vy0, 1.0, g);
            assert.ok(Math.abs(ang1 - Math.atan2(-17.0, 12.0)) < 1e-5);
        });

        it('calculates analytical apex time and elevation', () => {
            const apex = calculateTrajectoryApex(0, 4, 12, 9, -26.0);
            // tApex = 9 / 26 ~= 0.3461538
            assert.ok(Math.abs(apex.timeToApex - (9 / 26)) < 1e-6);
            // yApex = 4 + 81 / 52 = 4 + 1.557692 ~= 5.557692
            assert.ok(Math.abs(apex.apexY - (4 + 81 / 52)) < 1e-6);
        });

        it('calculates ground impact time of flight solving quadratic formula', () => {
            // y0 = 4, vy0 = 9, yTarget = 0, g = 26 -> t = (9 + sqrt(81 + 208)) / 26 = (9 + 17) / 26 = 1.000 s
            const tImpact = calculateFlightTime(4, 9, 0, -26.0);
            assert.ok(Math.abs(tImpact - 1.0) < 1e-6);

            // Unreachable target elevation above apex -> returns -1
            const unreachable = calculateFlightTime(4, 9, 10.0, -26.0);
            assert.equal(unreachable, -1);
        });

        it('solves ballistic launch velocity for given target and flight time (Mode A)', () => {
            // Target at (12, 0) from (0, 4) in T = 1.0 s under g = -26
            const sol = solveLaunchVelocityForTime(0, 4, 12, 0, 1.0, -26.0);
            assert.ok(sol !== null);
            assert.ok(Math.abs(sol.vx - 12.0) < 1e-6);
            assert.ok(Math.abs(sol.vy - 9.0) < 1e-6);
        });

        it('solves ballistic launch angle for fixed launch speed v0 (Mode B: Low and High Arcs)', () => {
            const x0 = 0, y0 = 0, tx = 10, ty = 0;
            const v0 = 20.0;
            const g = -26.0;

            const lowSol = solveLaunchVelocityForSpeed(x0, y0, tx, ty, v0, false, g);
            const highSol = solveLaunchVelocityForSpeed(x0, y0, tx, ty, v0, true, g);

            assert.ok(lowSol !== null);
            assert.ok(highSol !== null);

            // Low arc angle + high arc angle sum to 90 degrees (PI/2) on flat ground
            const angleSum = lowSol.launchAngle + highSol.launchAngle;
            assert.ok(Math.abs(angleSum - (Math.PI / 2)) < 1e-4);

            // Verify both land at x = 10, y = 0
            const posLow = getTrajectoryPosition(x0, y0, lowSol.vx, lowSol.vy, lowSol.timeOfFlight, g);
            assert.ok(Math.abs(posLow.x - 10.0) < 1e-3);
            assert.ok(Math.abs(posLow.y - 0.0) < 1e-3);

            const posHigh = getTrajectoryPosition(x0, y0, highSol.vx, highSol.vy, highSol.timeOfFlight, g);
            assert.ok(Math.abs(posHigh.x - 10.0) < 1e-3);
            assert.ok(Math.abs(posHigh.y - 0.0) < 1e-3);
        });

        it('samples discrete trajectory points along arc without NaN values', () => {
            const pts = sampleTrajectoryPoints(0, 4, 12, 9, 1.0, 10, -26.0);
            assert.equal(pts.length, 11);
            assert.equal(pts[0].x, 0);
            assert.equal(pts[0].y, 4);
            assert.ok(Math.abs(pts[10].x - 12.0) < 1e-5);
            assert.ok(Math.abs(pts[10].y - 0.0) < 1e-5);

            for (const pt of pts) {
                assert.ok(Number.isFinite(pt.x));
                assert.ok(Number.isFinite(pt.y));
                assert.equal(pt.z, 0);
            }
        });

        it('evaluates calculateTrajectory helper function', () => {
            const pos = calculateTrajectory({ x: 0, y: 4 }, { x: 12, y: 9 }, -26.0, 1.0);
            assert.equal(pos.x, 12.0);
            assert.equal(pos.y, 0.0);
            assert.equal(pos.z, 0.0);
        });
    });

    describe('applyDamage Master Function Integration', () => {
        it('applies damage, respects I-frames, and triggers stagger when poise breaks', () => {
            const target = {
                hp: 100,
                maxHp: 100,
                defense: 50,
                invulnerableTimer: 0,
                poiseState: createPoiseState(30)
            };

            const pkg = {
                rawDamage: 22,
                poiseDamage: 40,
                isHeavy: false
            };

            // Hit 1: 22 dmg / 1.5 = 15 net dmg, breaks 30 poise -> STAGGER
            const res = applyDamage(target, pkg);
            assert.equal(res.damageDealt, 15);
            assert.equal(res.newHp, 85);
            assert.equal(res.poiseBroken, true);
            assert.equal(target.poiseState.isStaggered, true);

            // Immediate follow-up attack during I-frame (invulnerableTimer = 0.3) -> 0 damage
            const res2 = applyDamage(target, pkg);
            assert.equal(res2.damageDealt, 0);
            assert.equal(res2.isInvulnerable, true);
            assert.equal(target.hp, 85);
        });

        it('deflects parried hits with 0 damage', () => {
            const target = {
                hp: 100,
                defense: 0,
                invulnerableTimer: 0,
                poiseState: createPoiseState(100)
            };

            const parriedPkg = {
                rawDamage: 50,
                isParried: true
            };

            const res = applyDamage(target, parriedPkg);
            assert.equal(res.damageDealt, 0);
            assert.equal(res.isParried, true);
            assert.equal(target.hp, 100);
        });
    });
});
