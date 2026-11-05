/**
 * Adversarial Deep Stress & Fuzzing Harness for Combat Math Remediation Verification
 * File: E:\Vaelthorn\.agents\teamwork\challenger_m1_fix_2\stress_combat_math_fix2.js
 * Author: challenger_m1_fix_2 (Empirical Challenger)
 */

const path = require('path');
const combatMath = require(path.resolve(__dirname, '../../../src/engine/combat_math'));

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const failures = [];

function assert(condition, name, details = '') {
    totalTests++;
    if (condition) {
        passedTests++;
        console.log(`  [PASS] ${name}`);
    } else {
        failedTests++;
        console.error(`  [FAIL] ${name} -- ${details}`);
        failures.push({ name, details });
    }
}

console.log('======================================================================');
console.log('CHALLENGER FIX 2: DEEP ADVERSARIAL COMBAT MATH STRESS HARNESS');
console.log('======================================================================\n');

// ============================================================================
// 1. DEFENSE MITIGATION & CUSTOM CONFIG FUZZING
// ============================================================================
console.log('--- 1. Defense Mitigation & Custom Config Fuzzing ---');

const malformedConfigs = [
    null,
    undefined,
    {},
    { minDefense: -100, defenseSoftCap: 100 },
    { minDefense: -99.999999, defenseSoftCap: 100 },
    { minDefense: -100.000001, defenseSoftCap: 100 },
    { minDefense: -1000, defenseSoftCap: 100 },
    { minDefense: -1e9, defenseSoftCap: 100 },
    { minDefense: -Infinity, defenseSoftCap: 100 },
    { minDefense: NaN, defenseSoftCap: 100 },
    { minDefense: -100, defenseSoftCap: 0 },
    { minDefense: -100, defenseSoftCap: -10 },
    { minDefense: -100, defenseSoftCap: -100 },
    { minDefense: -100, defenseSoftCap: NaN },
    { minDefense: -100, defenseSoftCap: Infinity },
    { minDefense: -100, defenseSoftCap: -Infinity }
];

let allConfigsSound = true;
let badConfigDetail = '';

for (const cfg of malformedConfigs) {
    for (const def of [-200, -100, -90, -50, 0, 50, 100, 1000, 1e9, NaN, Infinity, -Infinity]) {
        for (const raw of [1, 22, 50, 100, 1e6]) {
            try {
                const res = combatMath.calculateDamageMitigation(raw, def, cfg);
                if (!Number.isFinite(res) || res < 1 || isNaN(res)) {
                    allConfigsSound = false;
                    badConfigDetail = `cfg: ${JSON.stringify(cfg)}, def: ${def}, raw: ${raw} -> result: ${res}`;
                    break;
                }
            } catch (err) {
                allConfigsSound = false;
                badConfigDetail = `cfg: ${JSON.stringify(cfg)}, def: ${def}, raw: ${raw} -> threw ${err.message}`;
                break;
            }
        }
        if (!allConfigsSound) break;
    }
    if (!allConfigsSound) break;
}

assert(allConfigsSound, 'calculateDamageMitigation survives all malformed config and defense combinations', badConfigDetail);

// Exact singularity test: denominator clamp Math.max(0.01, ...)
const exactSingularity = combatMath.calculateDamageMitigation(50, -100, { minDefense: -100, defenseSoftCap: 100 });
assert(
    exactSingularity === 5000,
    'Exact singularity at minDefense=-100 clamps denominator to 0.01 (100x max cap = 5000)',
    `Expected 5000, got ${exactSingularity}`
);

// Zero and negative raw damage with adversarial configs
assert(combatMath.calculateDamageMitigation(0, -100, { minDefense: -100 }) === 0, 'Zero raw damage returns strictly 0 under singularity config');
assert(combatMath.calculateDamageMitigation(-50, -100, { minDefense: -100 }) === 0, 'Negative raw damage returns strictly 0 under singularity config');
assert(combatMath.calculateDamageMitigation(NaN, -100) === 0, 'NaN raw damage returns strictly 0');
assert(combatMath.calculateDamageMitigation(Infinity, -100) === 0, 'Infinity raw damage returns strictly 0');

console.log('');

// ============================================================================
// 2. MICRO-POISE DAMAGE & IEEE-754 DRIFT EXTREMES
// ============================================================================
console.log('--- 2. Micro-Poise Damage & IEEE-754 Drift Extremes ---');

// 2.1 1,000 hits of 0.05 on 50 max poise (Challenger 2 baseline check)
const poise50 = combatMath.createPoiseState(50, 20, 3.0);
let brokenAt = -1;
for (let i = 1; i <= 1000; i++) {
    const res = combatMath.applyPoiseDamage(poise50, 0.05);
    if (res.poiseBroken) {
        brokenAt = i;
        break;
    }
}
assert(brokenAt === 1000, '50 max poise with 1,000 hits of 0.05 breaks at exactly hit 1000', `brokenAt: ${brokenAt}`);
assert(poise50.currentPoise === 0, 'Final poise is exactly 0 after micro-poise break', `Poise: ${poise50.currentPoise}`);

// 2.2 Extreme micro-poise: 10,000 hits of 0.005 on 50 max poise
const poiseExt = combatMath.createPoiseState(50, 20, 3.0);
let brokenExt = -1;
for (let i = 1; i <= 10000; i++) {
    const res = combatMath.applyPoiseDamage(poiseExt, 0.005);
    if (res.poiseBroken) {
        brokenExt = i;
        break;
    }
}
assert(brokenExt === 10000, '50 max poise with 10,000 hits of 0.005 breaks at exactly hit 10000', `brokenExt: ${brokenExt}`);
assert(poiseExt.currentPoise === 0, 'Final poise is strictly 0 after 10,000 micro-hits', `Poise: ${poiseExt.currentPoise}`);

// 2.3 Sub-epsilon damage: 10,000 hits of 1e-4 on 1.0 max poise
const poiseSubEps = combatMath.createPoiseState(1.0, 20, 3.0);
let brokenSubAt = -1;
for (let i = 1; i <= 10000; i++) {
    const res = combatMath.applyPoiseDamage(poiseSubEps, 1e-4);
    if (res.poiseBroken) {
        brokenSubAt = i;
        break;
    }
}
assert(brokenSubAt === 10000, '10,000 hits of 1e-4 on 1.0 max poise breaks at hit 10000', `brokenSubAt: ${brokenSubAt}`);

// 2.4 Null/invalid poiseState resiliency
assert(combatMath.applyPoiseDamage(null, 10).poiseBroken === false, 'applyPoiseDamage on null state returns safely');
assert(combatMath.applyPoiseDamage(undefined, 10).poiseBroken === false, 'applyPoiseDamage on undefined state returns safely');

console.log('');

// ============================================================================
// 3. DELAY-CROSSING DELTA-TIME ACCURACY (POISE & RESONANCE)
// ============================================================================
console.log('--- 3. Delay-Crossing Delta-Time Accuracy ---');

// 3.1 Poise delay exact boundary
// maxPoise = 100, regenRate = 20 u/s, regenDelay = 3.0s
const poiseDelay = combatMath.createPoiseState(100, 20, 3.0);
poiseDelay.currentPoise = 10;
poiseDelay.timeSincePoiseDamage = 0;

// Step 1: tick exactly 3.0s (delay boundary hit, activeDt = 0)
combatMath.updatePoise(poiseDelay, 3.0);
assert(poiseDelay.currentPoise === 10, 'Poise at exactly delay threshold (3.0s) has 0 active regen', `Poise: ${poiseDelay.currentPoise}`);

// Step 2: tick 0.25s (activeDt = 0.25s -> +5.0 poise -> 15.0)
combatMath.updatePoise(poiseDelay, 0.25);
assert(Math.abs(poiseDelay.currentPoise - 15.0) < 1e-5, 'Poise after 0.25s post-delay regenerates exactly 5.0 units', `Poise: ${poiseDelay.currentPoise}`);

// 3.2 Single massive hitch crossing delay window
const poiseHitch = combatMath.createPoiseState(100, 20, 3.0);
poiseHitch.currentPoise = 10;
poiseHitch.timeSincePoiseDamage = 1.0; // 2.0s left until delay
// Advance 2.5s (0.5s active regen = +10 poise -> 20.0)
combatMath.updatePoise(poiseHitch, 2.5);
assert(
    Math.abs(poiseHitch.currentPoise - 20.0) < 1e-5,
    'Hitch crossing delay from 1.0s with dt=2.5s regenerates exactly 0.5s worth (20.0)',
    `Expected 20.0, got ${poiseHitch.currentPoise}`
);

// 3.3 Resonance delay exact boundary
// max = 100, decayDelay = 4.0s, decayRate = 5.0 u/s
const resDelay = combatMath.createResonanceState(100, 100);
resDelay.idleTimer = 0.0;

// Step 1: tick exactly 4.0s
combatMath.updateResonance(resDelay, 4.0);
assert(resDelay.current === 100, 'Resonance at exactly decayDelay (4.0s) has 0 active decay', `Resonance: ${resDelay.current}`);

// Step 2: tick 0.4s (activeDt = 0.4s -> -2.0 resonance -> 98.0)
combatMath.updateResonance(resDelay, 0.4);
assert(Math.abs(resDelay.current - 98.0) < 1e-5, 'Resonance after 0.4s post-delay decays exactly 2.0 units', `Resonance: ${resDelay.current}`);

// 3.4 Resonance single massive hitch crossing delay
const resHitch = combatMath.createResonanceState(100, 100);
resHitch.idleTimer = 2.0; // 2.0s left until delay
// Advance 3.0s (1.0s active decay = -5.0 resonance -> 95.0)
combatMath.updateResonance(resHitch, 3.0);
assert(
    Math.abs(resHitch.current - 95.0) < 1e-5,
    'Hitch crossing resonance delay from 2.0s with dt=3.0s decays exactly 1.0s worth (95.0)',
    `Expected 95.0, got ${resHitch.current}`
);

// 3.5 Massive dt clamping (1e6 seconds)
const poiseSuperHitch = combatMath.createPoiseState(100, 20, 3.0);
poiseSuperHitch.currentPoise = 10;
combatMath.updatePoise(poiseSuperHitch, 1e6);
assert(poiseSuperHitch.currentPoise === 100, '1e6s timestep on poise cleanly clamps at maxPoise without NaN or Infinity');

const resSuperHitch = combatMath.createResonanceState(100, 100);
combatMath.updateResonance(resSuperHitch, 1e6);
assert(resSuperHitch.current === 0.0 && !resSuperHitch.isOverdrive, '1e6s timestep on resonance cleanly drains to 0.0 without underflow');

console.log('');

// ============================================================================
// 4. BALLISTICS: DOWNWARD VERTICAL & ANGLED PARABOLIC ACCURACY
// ============================================================================
console.log('--- 4. Ballistics: Downward Vertical & Angled Parabolic Accuracy ---');

// 4.1 Downward vertical fire across 100 randomized heights and speeds
let maxVertError = 0;
for (let i = 0; i < 100; i++) {
    const y0 = 1.0 + Math.random() * 50.0;
    const speed = 1.0 + Math.random() * 50.0;
    const sol = combatMath.solveLaunchVelocityForSpeed(0, y0, 0, 0, speed, false, -26);
    if (!sol) {
        maxVertError = 999;
        break;
    }
    const land = combatMath.getTrajectoryPosition(0, y0, sol.vx, sol.vy, sol.timeOfFlight, -26);
    const err = Math.abs(land.y - 0.0);
    if (err > maxVertError) maxVertError = err;
}
assert(
    maxVertError < 1e-6,
    `Vertical downward fire across 100 randomized trials has 0.000m error (max error: ${maxVertError.toExponential(3)}m)`,
    `Max error: ${maxVertError}`
);

// 4.2 Downward angled parabolic fire (Mode B) - Low Arc & High Arc
// Origin (0, 10), Target (15, 0), speed = 25, gravity = -26
const angLow = combatMath.solveLaunchVelocityForSpeed(0, 10, 15, 0, 25, false, -26);
const angHigh = combatMath.solveLaunchVelocityForSpeed(0, 10, 15, 0, 25, true, -26);

assert(angLow !== null, 'Downward angled low arc has valid solution');
assert(angHigh !== null, 'Downward angled high arc has valid solution');

if (angLow && angHigh) {
    const lowPos = combatMath.getTrajectoryPosition(0, 10, angLow.vx, angLow.vy, angLow.timeOfFlight, -26);
    const highPos = combatMath.getTrajectoryPosition(0, 10, angHigh.vx, angHigh.vy, angHigh.timeOfFlight, -26);
    const lowErrX = Math.abs(lowPos.x - 15);
    const lowErrY = Math.abs(lowPos.y - 0);
    const highErrX = Math.abs(highPos.x - 15);
    const highErrY = Math.abs(highPos.y - 0);

    assert(
        lowErrX < 1e-3 && lowErrY < 1e-3,
        `Downward angled low arc lands precisely on target (errX: ${lowErrX.toFixed(4)}, errY: ${lowErrY.toFixed(4)})`,
        `land: (${lowPos.x.toFixed(4)}, ${lowPos.y.toFixed(4)})`
    );
    assert(
        highErrX < 1e-3 && highErrY < 1e-3,
        `Downward angled high arc lands precisely on target (errX: ${highErrX.toFixed(4)}, errY: ${highErrY.toFixed(4)})`,
        `land: (${highPos.x.toFixed(4)}, ${highPos.y.toFixed(4)})`
    );
}

// 4.3 Backward downward angled fire: (15, 10) -> (0, 0)
const backAngLow = combatMath.solveLaunchVelocityForSpeed(15, 10, 0, 0, 25, false, -26);
assert(backAngLow !== null && backAngLow.vx < 0, 'Backward downward angled fire has negative vx');
if (backAngLow) {
    const backPos = combatMath.getTrajectoryPosition(15, 10, backAngLow.vx, backAngLow.vy, backAngLow.timeOfFlight, -26);
    const backErrX = Math.abs(backPos.x - 0);
    const backErrY = Math.abs(backPos.y - 0);
    assert(
        backErrX < 1e-3 && backErrY < 1e-3,
        `Backward downward low arc lands precisely on target (errX: ${backErrX.toFixed(4)}, errY: ${backErrY.toFixed(4)})`,
        `land: (${backPos.x.toFixed(4)}, ${backPos.y.toFixed(4)})`
    );
}

// 4.4 Fuzzing 500 random reachable ballistic trajectories (low & high arc)
let allFuzzPassed = true;
let fuzzDetail = '';
for (let i = 0; i < 500; i++) {
    const x0 = (Math.random() - 0.5) * 20;
    const y0 = Math.random() * 15;
    const targetX = x0 + (Math.random() > 0.5 ? 1 : -1) * (3.0 + Math.random() * 15.0);
    const targetY = Math.random() * 10;
    const speed = 25.0 + Math.random() * 25.0; // sufficient speed to reach
    const highArc = Math.random() > 0.5;

    const sol = combatMath.solveLaunchVelocityForSpeed(x0, y0, targetX, targetY, speed, highArc, -26);
    if (sol !== null) {
        const landing = combatMath.getTrajectoryPosition(x0, y0, sol.vx, sol.vy, sol.timeOfFlight, -26);
        const errX = Math.abs(landing.x - targetX);
        const errY = Math.abs(landing.y - targetY);
        if (errX > 0.01 || errY > 0.01 || landing.z !== 0) {
            allFuzzPassed = false;
            fuzzDetail = `Trial ${i}: target (${targetX.toFixed(2)}, ${targetY.toFixed(2)}) reached (${landing.x.toFixed(2)}, ${landing.y.toFixed(2)}), errX: ${errX}, errY: ${errY}`;
            break;
        }
    }
}
assert(allFuzzPassed, '500 randomized ballistic trajectories land within 0.01m on target and adhere to Z=0', fuzzDetail);

console.log('');

// ============================================================================
// 5. MASTER applyDamage INTEGRATION FUZZING
// ============================================================================
console.log('--- 5. Master applyDamage Integration Fuzzing ---');

// Target with poise and HP receiving sequential hits outside I-frame window
const footman = {
    hp: 50,
    maxHp: 50,
    defense: 10,
    invulnerableTimer: 0,
    poiseState: combatMath.createPoiseState(30, 20, 3.0)
};

// Hit 1: 20 raw damage, 15 poise damage
const h1 = combatMath.applyDamage(footman, { rawDamage: 20, poiseDamage: 15 });
assert(h1.damageDealt === 18 && footman.hp === 32, 'Hit 1 deals 18 net damage to footman');
assert(footman.poiseState.currentPoise === 15 && !h1.poiseBroken, 'Poise reduced to 15 without break');

// Simulate 0.35s passing (I-frame window expires)
footman.invulnerableTimer = 0;

// Hit 2: 20 raw damage, 20 poise damage -> breaks poise
const h2 = combatMath.applyDamage(footman, { rawDamage: 20, poiseDamage: 20 });
assert(h2.poiseBroken === true && footman.poiseState.isStaggered === true, 'Hit 2 cleanly breaks poise and staggers');

// Simulate 0.35s passing (I-frame window expires)
footman.invulnerableTimer = 0;

// Hit 3: Critical Riposte against staggered footman
const h3 = combatMath.applyDamage(footman, { rawDamage: 20, isRiposte: true });
assert(h3.isCritical === true && h3.damageDealt > 20, `Hit 3 executes Critical Riposte for ${h3.damageDealt} damage`);
assert(footman.hp <= 0 && h3.isDead === true, 'Footman defeated cleanly');

// Parried attack against target
const parryTarget = { hp: 100, maxHp: 100, defense: 20, invulnerableTimer: 0 };
const parryRes = combatMath.applyDamage(parryTarget, { rawDamage: 50, isParried: true });
assert(parryRes.damageDealt === 0 && parryTarget.hp === 100, 'Parried attack inflicts strictly 0 damage');

// Invulnerable target (I-frames)
const iframeTarget = { hp: 100, maxHp: 100, defense: 0, invulnerableTimer: 0.25 };
const iframeRes = combatMath.applyDamage(iframeTarget, { rawDamage: 50 });
assert(iframeRes.damageDealt === 0 && iframeTarget.hp === 100, 'I-frame active target absorbs attack with 0 damage');

console.log('\n======================================================================');
console.log(`CHALLENGER FIX 2 HARNESS COMPLETE: ${passedTests}/${totalTests} Passed (${failedTests} Failed)`);
console.log('======================================================================\n');

if (failures.length > 0) {
    console.error('FAILURES RECORDED:');
    for (const f of failures) {
        console.error(`- ${f.name}: ${f.details}`);
    }
    process.exit(1);
} else {
    console.log('>>> VERDICT: ALL ADVERSARIAL STRESS TESTS PASSED CLEANLY <<<');
    process.exit(0);
}
