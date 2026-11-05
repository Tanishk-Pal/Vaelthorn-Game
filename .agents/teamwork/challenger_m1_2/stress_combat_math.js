/**
 * Adversarial Stress & Fuzz Test Harness for Combat Math Engine
 * File: E:\Vaelthorn\.agents\teamwork\challenger_m1_2\stress_combat_math.js
 * 
 * Verifies mathematical resilience, numerical stability, singularity avoidance,
 * boundary clamping, and trajectory kinematics under extreme adversarial inputs.
 */

const path = require('path');
const combatMath = require(path.resolve(__dirname, '../../../src/engine/combat_math'));

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const findings = [];

function assert(condition, testName, details = '') {
    totalTests++;
    if (condition) {
        passedTests++;
        console.log(`  [PASS] ${testName}`);
    } else {
        failedTests++;
        console.error(`  [FAIL] ${testName}: ${details}`);
        findings.push({ testName, details });
    }
}

console.log('======================================================================');
console.log('VAELTHORN COMBAT MATH ADVERSARIAL STRESS TEST HARNESS');
console.log('======================================================================\n');

// ============================================================================
// SUITE 1: Armor Mitigation & Damage Scaling Singularities
// ============================================================================
console.log('--- SUITE 1: Armor Mitigation & Damage Scaling Singularities ---');

// 1.1 Fuzzing defense across extreme values
const testDefenses = [-1000, -100, -95, -90, -50, -10, -1, 0, 1, 10, 50, 100, 500, 1e4, 1e6, 1e9, 1e15];
let defenseMitigationAllSound = true;

for (const def of testDefenses) {
    const mit = combatMath.calculateDamageMitigation(50, def);
    if (!Number.isFinite(mit) || mit < 1) {
        defenseMitigationAllSound = false;
    }
}
assert(defenseMitigationAllSound, 'calculateDamageMitigation yields finite integer >= 1 across all defense values');

// 1.2 Singularity test at defense = -100 (where 1 + def/100 = 0 if unclamped)
const singularityMitigation = combatMath.calculateDamageMitigation(50, -100);
assert(
    singularityMitigation === 500,
    'Singularity at defense = -100 clamped to -90 (10x amplification cap = 500)',
    `Expected 500, got ${singularityMitigation}`
);

// 1.3 Astronomical defense (1e9) guarantees minimum 1 chip damage
const astronomicalMitigation = combatMath.calculateDamageMitigation(50, 1e9);
assert(
    astronomicalMitigation === 1,
    'Astronomical defense (1e9) guarantees minimum 1 chip damage',
    `Expected 1, got ${astronomicalMitigation}`
);

// 1.4 Non-positive incoming damage
const zeroDamage = combatMath.calculateDamageMitigation(0, 50);
const negativeDamage = combatMath.calculateDamageMitigation(-100, 50);
assert(zeroDamage === 0, 'Zero raw damage returns strictly 0 damage', `Got ${zeroDamage}`);
assert(negativeDamage === 0, 'Negative raw damage returns strictly 0 damage', `Got ${negativeDamage}`);

// 1.5 Non-finite incoming damage (NaN, Infinity, -Infinity)
const nanDamage = combatMath.calculateDamageMitigation(NaN, 50);
const infDamage = combatMath.calculateDamageMitigation(Infinity, 50);
const negInfDamage = combatMath.calculateDamageMitigation(-Infinity, 50);
assert(nanDamage === 0, 'NaN raw damage sanitized to 0', `Got ${nanDamage}`);
assert(infDamage === 0, 'Infinity raw damage sanitized to 0', `Got ${infDamage}`);
assert(negInfDamage === 0, '-Infinity raw damage sanitized to 0', `Got ${negInfDamage}`);

// 1.6 Non-finite defense values (NaN, Infinity)
const nanDefMit = combatMath.calculateDamageMitigation(50, NaN);
const infDefMit = combatMath.calculateDamageMitigation(50, Infinity);
assert(nanDefMit === 50, 'NaN defense defaults safely to 0 (unmitigated 50)', `Got ${nanDefMit}`);
assert(infDefMit === 50, 'Infinity defense defaults safely to 0 (unmitigated 50)', `Got ${infDefMit}`);

// 1.7 calculateDamage helper negative defense clamping
const calcDmgNegDef = combatMath.calculateDamage(50, -100);
assert(calcDmgNegDef === 50, 'calculateDamage helper clamps negative defense to 0', `Got ${calcDmgNegDef}`);

// 1.8 Custom config with minDefense = -100 (singularity vulnerability)
const customSingularityMit = combatMath.calculateDamageMitigation(50, -100, { minDefense: -100, defenseSoftCap: 100 });
assert(
    Number.isFinite(customSingularityMit),
    'Custom config with minDefense: -100 avoids Infinity division by zero',
    `Got ${customSingularityMit}`
);

// 1.9 Null config resilience
let nullConfigThrows = false;
try {
    combatMath.calculateDamageMitigation(50, 0, null);
} catch (e) {
    nullConfigThrows = true;
}
assert(!nullConfigThrows, 'calculateDamageMitigation survives null config without throwing TypeError');

// 1.10 applyDamage master integration with extreme inputs
const dummyTarget = { hp: 100, maxHp: 100, defense: 1e9, invulnerableTimer: 0, poiseState: null };
const applyRes = combatMath.applyDamage(dummyTarget, { rawDamage: 50 });
assert(
    applyRes.damageDealt === 1 && dummyTarget.hp === 99,
    'applyDamage chips target with 1 damage against 1e9 defense',
    `damageDealt: ${applyRes.damageDealt}, hp: ${dummyTarget.hp}`
);

// Dead entity check
const deadTarget = { hp: 0, maxHp: 100, defense: 0, invulnerableTimer: 0 };
const deadRes = combatMath.applyDamage(deadTarget, { rawDamage: 100 });
assert(deadRes.damageDealt === 0 && deadRes.isDead === true, 'applyDamage on 0 HP target deals 0 damage and returns isDead');

console.log('');

// ============================================================================
// SUITE 2: Poise Depletion & Regeneration Edge Cases
// ============================================================================
console.log('--- SUITE 2: Poise Depletion & Regeneration Edge Cases ---');

// 2.1 Infinite and extreme poise damage
const poiseState1 = combatMath.createPoiseState(100, 20, 3.0);
const infPoiseRes = combatMath.applyPoiseDamage(poiseState1, Infinity);
assert(
    poiseState1.currentPoise === 100 && !infPoiseRes.poiseBroken,
    'Non-finite poiseDamage (Infinity) safely sanitized without triggering break',
    `Poise: ${poiseState1.currentPoise}`
);

const hugePoiseRes = combatMath.applyPoiseDamage(poiseState1, 1e9);
assert(
    poiseState1.currentPoise === 0 && hugePoiseRes.poiseBroken && poiseState1.isStaggered,
    'Massive poiseDamage (1e9) cleanly breaks poise and triggers stagger',
    `Poise: ${poiseState1.currentPoise}, staggered: ${poiseState1.isStaggered}`
);

// 2.2 Already staggered entity receiving further hits
const repeatHitRes = combatMath.applyPoiseDamage(poiseState1, 50);
assert(
    repeatHitRes.isStaggered && !repeatHitRes.poiseBroken,
    'Hitting an already-staggered entity does not re-trigger poiseBroken',
    `poiseBroken: ${repeatHitRes.poiseBroken}`
);

// 2.3 Micro-staggers: 1,000 hits of 0.05 poise damage on 50 max poise
const poiseState2 = combatMath.createPoiseState(50, 20, 3.0);
let breakOccurred = false;
let breakStep = -1;
for (let i = 1; i <= 1000; i++) {
    const res = combatMath.applyPoiseDamage(poiseState2, 0.05);
    if (res.poiseBroken) {
        breakOccurred = true;
        breakStep = i;
        break;
    }
}
assert(
    breakOccurred,
    'Micro-staggers: 1,000 hits of 0.05 poise damage triggers stagger threshold under IEEE-754 precision',
    `breakOccurred: ${breakOccurred}, final poise: ${poiseState2.currentPoise}`
);

// 2.4 Stagger recovery via updatePoise
const staggerRecoveryState = combatMath.createPoiseState(50, 20, 3.0);
combatMath.applyPoiseDamage(staggerRecoveryState, 50); // cleanly staggered
assert(staggerRecoveryState.isStaggered === true, 'Entity is initially staggered');
combatMath.updatePoise(staggerRecoveryState, 1.2); // standard stagger duration elapsed
assert(
    !staggerRecoveryState.isStaggered && staggerRecoveryState.currentPoise === 50,
    'updatePoise completes stagger recovery and fully restores poise to maxPoise',
    `isStaggered: ${staggerRecoveryState.isStaggered}, current: ${staggerRecoveryState.currentPoise}`
);

// 2.5 Out-of-combat poise regeneration (small ticks)
const regenState = combatMath.createPoiseState(50, 20, 3.0);
regenState.currentPoise = 10;
regenState.timeSincePoiseDamage = 0;
combatMath.updatePoise(regenState, 2.5); // Still within 3.0s regenDelay
assert(regenState.currentPoise === 10, 'Poise does not regenerate during regenDelay', `Poise: ${regenState.currentPoise}`);

// Advance 0.5s more to hit 3.0s exactly
combatMath.updatePoise(regenState, 0.5);
assert(regenState.currentPoise === 10, 'Poise at exactly 3.0s regenDelay has not yet regenerated', `Poise: ${regenState.currentPoise}`);

// Advance 0.5s past delay (0.5s @ 20 u/s = +10 poise -> 20)
combatMath.updatePoise(regenState, 0.5);
assert(
    Math.abs(regenState.currentPoise - 20) < 1e-4,
    'Poise regenerates at 20 u/s once delay expires (incremental ticks)',
    `Poise: ${regenState.currentPoise}`
);

// 2.6 Large timestep / frame hitch over-regeneration test
const hitchRegenState = combatMath.createPoiseState(100, 20, 3.0);
hitchRegenState.currentPoise = 10;
hitchRegenState.timeSincePoiseDamage = 0;
// Advance 3.1s in one single hitch tick (only 0.1s should actively regenerate = +2 poise -> 12)
combatMath.updatePoise(hitchRegenState, 3.1);
assert(
    Math.abs(hitchRegenState.currentPoise - 12) < 0.1,
    'Frame hitch / large timestep does not over-regenerate during delay phase',
    `Expected ~12, got ${hitchRegenState.currentPoise}`
);

// 2.7 Overfill clamp
combatMath.updatePoise(regenState, 10.0);
assert(
    regenState.currentPoise === regenState.maxPoise,
    'Poise regeneration strictly clamps at maxPoise without overflow',
    `Poise: ${regenState.currentPoise}`
);

// 2.8 Edge case poise container creation
const zeroPoiseState = combatMath.createPoiseState(0);
assert(zeroPoiseState.maxPoise === 1, 'createPoiseState(0) clamps maxPoise to minimum 1', `maxPoise: ${zeroPoiseState.maxPoise}`);

console.log('');

// ============================================================================
// SUITE 3: Stygian Resonance Gauge Economy & Boundary Fuzzing
// ============================================================================
console.log('--- SUITE 3: Stygian Resonance Gauge Economy & Boundary Fuzzing ---');

const resState = combatMath.createResonanceState(0, 100);

// 3.1 1,000 rapid light hits (+15 each)
for (let i = 0; i < 1000; i++) {
    combatMath.addResonance(resState, 15);
}
assert(
    resState.current === 100 && resState.isOverdrive === true,
    '1,000 rapid hits cap resonance strictly at 100 with isOverdrive = true',
    `current: ${resState.current}, isOverdrive: ${resState.isOverdrive}`
);

// 3.2 Spending resonance
const spend1 = combatMath.spendResonance(resState, 25);
assert(
    spend1 === true && resState.current === 75 && resState.isOverdrive === false,
    'Spending 25 resonance reduces gauge to 75 and exits Overdrive',
    `current: ${resState.current}, isOverdrive: ${resState.isOverdrive}`
);

combatMath.spendResonance(resState, 25); // 50
combatMath.spendResonance(resState, 25); // 25
combatMath.spendResonance(resState, 25); // 0
assert(resState.current === 0, 'Resonance drains down to 0 upon multiple casts', `current: ${resState.current}`);

const spendFail = combatMath.spendResonance(resState, 25);
assert(spendFail === false && resState.current === 0, 'Spending resonance with 0 energy fails cleanly without underflow');

// 3.3 Rapid out-of-combat decay ticks
combatMath.addResonance(resState, 100);
// 240 ticks of 0.0166667s = 4.0s (delay)
for (let i = 0; i < 240; i++) {
    combatMath.updateResonance(resState, 0.016666666666666666);
}
assert(
    resState.current === 100,
    'Resonance remains intact during 4.0s decay delay',
    `current: ${resState.current}`
);

// Next 600 ticks = 10s of decay @ 5 u/s = 50 lost -> current ~ 50
for (let i = 0; i < 600; i++) {
    combatMath.updateResonance(resState, 0.016666666666666666);
}
assert(
    Math.abs(resState.current - 50) < 0.1 && resState.isOverdrive === false,
    'Resonance decays at steady 5.0 u/s past decay delay',
    `current: ${resState.current}`
);

// Decay to zero and verify underflow clamp
for (let i = 0; i < 1000; i++) {
    combatMath.updateResonance(resState, 0.05);
}
assert(
    resState.current === 0.0,
    'Resonance decay stops cleanly at 0.0 without underflow',
    `current: ${resState.current}`
);

// 3.4 Large timestep / frame hitch over-drain test
const hitchResState = combatMath.createResonanceState(100, 100);
// Timestep of 4.1s (where decayDelay is 4.0s). Only 0.1s should actively decay = -0.5 -> 99.5
combatMath.updateResonance(hitchResState, 4.1);
assert(
    Math.abs(hitchResState.current - 99.5) < 0.1,
    'Frame hitch / large timestep does not over-drain during delay phase',
    `Expected ~99.5, got ${hitchResState.current}`
);

console.log('');

// ============================================================================
// SUITE 4: Parabolic Projectile Ballistics & Extremes
// ============================================================================
console.log('--- SUITE 4: Parabolic Projectile Ballistics & Extremes ---');

// 4.1 Extreme launch angles: 0 deg, 90 deg, 180 deg
const angle0 = combatMath.getTrajectoryAngle(20, 0, 0);
assert(Math.abs(angle0) < 1e-6, '0 deg horizontal launch angle verified at t=0', `Angle: ${angle0}`);

const angle90 = combatMath.getTrajectoryAngle(0, 20, 0);
assert(Math.abs(angle90 - Math.PI / 2) < 1e-6, '90 deg vertical launch angle verified at t=0', `Angle: ${angle90}`);

const angle180 = combatMath.getTrajectoryAngle(-20, 0, 0);
assert(Math.abs(angle180 - Math.PI) < 1e-6, '180 deg backward launch angle verified at t=0', `Angle: ${angle180}`);

// 4.2 Analytical Apex at 90 degrees
const apex90 = combatMath.calculateTrajectoryApex(0, 0, 0, 26, -26);
assert(
    Math.abs(apex90.timeToApex - 1.0) < 1e-4 && Math.abs(apex90.apexY - 13.0) < 1e-4,
    '90 deg vertical launch apex calculation: timeToApex=1.0s, apexY=13.0m',
    `time: ${apex90.timeToApex}, apexY: ${apex90.apexY}`
);

// 4.3 Flight time to impact ground
const flightTimeGround = combatMath.calculateFlightTime(0, 26, 0, -26);
assert(
    Math.abs(flightTimeGround - 2.0) < 1e-4,
    'Ground impact flight time: exactly 2 * timeToApex = 2.0s',
    `flightTime: ${flightTimeGround}`
);

// 4.4 Targets out of range (Mode B solver)
const outOfRangeTarget = combatMath.solveLaunchVelocityForSpeed(0, 0, 20, 0, 10, false, -26);
assert(
    outOfRangeTarget === null,
    'Target beyond maximum ballistic reach returns null cleanly without NaN',
    `Result: ${outOfRangeTarget}`
);

// Overhead target higher than max vertical height v0^2 / (2g)
const outOfRangeHigh = combatMath.solveLaunchVelocityForSpeed(0, 0, 0, 5, 10, false, -26);
assert(
    outOfRangeHigh === null,
    'Overhead target higher than ballistic apex returns null cleanly',
    `Result: ${outOfRangeHigh}`
);

// 4.5 Negative and zero launch speeds
const negSpeedSol = combatMath.solveLaunchVelocityForSpeed(0, 0, 5, 0, -10, false, -26);
const zeroSpeedSol = combatMath.solveLaunchVelocityForSpeed(0, 0, 5, 0, 0, false, -26);
assert(negSpeedSol === null, 'Negative launch speed returns null', `Result: ${negSpeedSol}`);
assert(zeroSpeedSol === null, 'Zero launch speed returns null', `Result: ${zeroSpeedSol}`);

// 4.6 Backward target coordinates (Mode A solver)
const backwardTimeSol = combatMath.solveLaunchVelocityForTime(10, 0, -5, 2, 1.5, -26);
assert(
    backwardTimeSol !== null && backwardTimeSol.vx < 0,
    'Mode A solver computes negative vx for backward target destination',
    `vx: ${backwardTimeSol?.vx}, vy: ${backwardTimeSol?.vy}`
);

const landingPos = combatMath.getTrajectoryPosition(10, 0, backwardTimeSol.vx, backwardTimeSol.vy, 1.5, -26);
assert(
    Math.abs(landingPos.x - (-5)) < 1e-4 && Math.abs(landingPos.y - 2) < 1e-4 && landingPos.z === 0,
    'Mode A backward trajectory lands precisely on target (-5, 2, 0) at t=1.5s',
    `x: ${landingPos.x}, y: ${landingPos.y}, z: ${landingPos.z}`
);

// 4.7 Backward target coordinates (Mode B solver, Low and High Arcs)
const backwardSpeedLow = combatMath.solveLaunchVelocityForSpeed(0, 0, -10, 0, 20, false, -26);
const backwardSpeedHigh = combatMath.solveLaunchVelocityForSpeed(0, 0, -10, 0, 20, true, -26);
assert(
    backwardSpeedLow !== null && backwardSpeedLow.vx < 0 && backwardSpeedHigh !== null && backwardSpeedHigh.vx < 0,
    'Mode B solver solves backward trajectories for both low and high arcs',
    `Low vx: ${backwardSpeedLow?.vx}, High vx: ${backwardSpeedHigh?.vx}`
);

const lowLand = combatMath.getTrajectoryPosition(0, 0, backwardSpeedLow.vx, backwardSpeedLow.vy, backwardSpeedLow.timeOfFlight, -26);
assert(
    Math.abs(lowLand.x - (-10)) < 1e-3 && Math.abs(lowLand.y - 0) < 1e-3,
    'Mode B low arc lands precisely on backward target (-10, 0)',
    `x: ${lowLand.x}, y: ${lowLand.y}`
);

const highLand = combatMath.getTrajectoryPosition(0, 0, backwardSpeedHigh.vx, backwardSpeedHigh.vy, backwardSpeedHigh.timeOfFlight, -26);
assert(
    Math.abs(highLand.x - (-10)) < 1e-3 && Math.abs(highLand.y - 0) < 1e-3,
    'Mode B high arc lands precisely on backward target (-10, 0)',
    `x: ${highLand.x}, y: ${highLand.y}`
);

// 4.8 Downward vertical ballistic fire (dx < 1e-4, dy < 0)
const vertDownSol = combatMath.solveLaunchVelocityForSpeed(0, 10, 0, 0, 10, false, -26);
const vertDownPos = combatMath.getTrajectoryPosition(0, 10, vertDownSol.vx, vertDownSol.vy, vertDownSol.timeOfFlight, -26);
const vertDownError = Math.abs(vertDownPos.y - 0);
console.log(`  [DIAGNOSTIC] Vertical downward fire target y=0, actual y at timeOfFlight: ${vertDownPos.y.toFixed(3)}, error: ${vertDownError.toFixed(3)}m`);
assert(
    vertDownError < 0.05,
    'Vertical downward fire timeOfFlight lands on target y=0 (accounting for gravity acceleration)',
    `Actual y: ${vertDownPos.y}, error: ${vertDownError}m`
);

// 4.9 Trajectory discrete sampling sanity & Z=0 constraint
const sampled = combatMath.sampleTrajectoryPoints(0, 0, 15, 12, 1.5, 30, -26);
let allFinite = true;
let allZZero = true;
for (const p of sampled) {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.t)) allFinite = false;
    if (p.z !== 0) allZZero = false;
}
assert(sampled.length === 31, 'sampleTrajectoryPoints produces exactly numSegments + 1 points', `Length: ${sampled.length}`);
assert(allFinite && allZZero, 'All sampled points have finite coordinates and strict Z=0 2.5D plane adherence');

console.log('\n======================================================================');
console.log(`STRESS TEST COMPLETE: ${passedTests}/${totalTests} Passed (${failedTests} Failed)`);
console.log('======================================================================\n');

if (findings.length > 0) {
    console.log('EMPIRICALLY CONFIRMED DEFECTS & FINDINGS:');
    for (const f of findings) {
        console.log(`- ${f.testName}`);
        console.log(`  Details: ${f.details}`);
    }
}
