# Test Infrastructure Specification: Vaelthorn — The Oath of Darkness

**Document Version:** 1.0.0  
**Target Platform:** Node.js v24.19.0+ / Native WebGL 2.5D Core  
**Test Runner:** `node --test` (Built-in Test Runner)  
**Assertion Framework:** `node:assert/strict`  

---

## 1. Test Philosophy & Architecture

The test infrastructure for **"Vaelthorn: The Oath of Darkness"** is built on four fundamental principles:

1. **Opaque-Box & Requirement-Driven**: Tests assert observable outcomes, state transitions, physics coordinates, and combat values specified in `PROJECT.md` and `spec_miner_survey_1/spec_report.md` rather than internal implementation quirks.
2. **Deterministic 60Hz Simulation**: Kinematic integration, projectile parabolas, timer decays, and AI state machines run on discrete delta times ($\Delta t = 1/60\text{ s} \approx 0.016667\text{ s}$) matching the game's production loop.
3. **Progressive Testability & Zero-Dependency Execution**: Tests execute natively using Node.js built-in modules (`node:test`, `node:assert/strict`) with zero third-party npm package overhead. Tests adapt seamlessly via the engine loader: dynamically exercising `src/engine/` modules as they are delivered across Milestones 1 through 4, backed by authoritative mathematical reference specifications.
4. **Adversarial & Boundary Verification**: Rigorous edge-case coverage including extreme inputs, NaN/Infinity guards, zero-division defenses, $Z=0$ 2.5D planar clamps, coyote/jump buffer threshold boundaries, and multi-entity collision suppression.

---

## 2. Directory Layout & Test Suite Hierarchy

```
E:\Vaelthorn\
├── TEST_INFRA.md                        # Master Test Infrastructure Specification
├── TEST_READY.md                        # Test Readiness Sign-off & Execution Summary
├── src\
│   └── engine\                          # Modular Pure-Mathematical JavaScript Core
│       ├── kinematics.js                # Kinematics, jumps, gravity, coyote/buffer, Z-clamp
│       ├── hitbox.js                    # 2.5D AABB, knockback vector, HitTracker, raycasts
│       ├── combat_math.js               # Damage mitigation, poise, resonance, parabolas
│       ├── parry_system.js              # 6-frame parry window, deflection, counter riposte
│       ├── character_combat.js          # Combo chain, hit-stop, dodge roll, spells
│       ├── enemy_ai_fsm.js              # Deterministic Moore/Mealy AI FSM
│       └── boss_encounter.js            # Multi-phase Vael-Krag boss encounter
└── tests\
    ├── helpers\
    │   └── engine_loader.js             # Dynamic engine module resolver & reference contracts
    ├── e2e\
    │   ├── tier1_features.test.js       # Tier 1: 50 Core Features in Isolation
    │   ├── tier2_boundaries.test.js     # Tier 2: Boundary, Extreme & Error Condition Guards
    │   ├── tier3_pairwise.test.js       # Tier 3: Cross-Feature Interactions & Pairwise Matrix
    │   └── tier4_workloads.test.js      # Tier 4: Real-World Combat Encounter Workloads
    └── playtest_runner.js               # Deterministic 60Hz Headless Playtest Simulation Runner
```

---

## 3. Complete 50-Feature Inventory Coverage Matrix

Every single feature of the 50-feature inventory in `PROJECT.md` is mapped to an authoritative test case across Tiers 1–4 and the Playtest Runner:

| # | Feature Name | Category | Tier | Test File | Primary Test Assertion / Method |
|---|--------------|----------|------|-----------|---------------------------------|
| 1 | 2.5D Plane Constraint | Kinematics | T1, T2 | `tier1_features.test.js`, `tier2_boundaries.test.js` | Clamps $z \ne 0$ drift to strictly $0.0$; $\|z\| \le 0.001$ tolerance |
| 2 | Horizontal Locomotion & Accel | Kinematics | T1 | `tier1_features.test.js` | $v_x = u_x \cdot 9.0\text{ m/s}$ with responsive input scaling |
| 3 | Directional Facing Flip | Kinematics | T1 | `tier1_features.test.js` | Facing flips $\pm 1$ when $|u_x| > 0.1$; deadzone holds previous |
| 4 | Full Jump Kinematics | Kinematics | T1 | `tier1_features.test.js` | $v_{y0} = \sqrt{2 \cdot \|g\| \cdot h}$ ($h=2.4\text{ m}$, $g=-26.0 \implies v_{y0} \approx 11.17\text{ m/s}$) |
| 5 | Variable Jump Cut (Low Hop) | Kinematics | T1 | `tier1_features.test.js` | Releasing jump applies $2.2\times g$ ($a_y = -57.2\text{ m/s}^2$) |
| 6 | Snappy Falling Gravity | Kinematics | T1 | `tier1_features.test.js` | Falling applies $1.6\times g$ ($a_y = -41.6\text{ m/s}^2$) |
| 7 | Coyote Time | Kinematics | T1, T2 | `tier1_features.test.js`, `tier2_boundaries.test.js` | Allows jump for $0.12\text{ s}$ post-ledge; rejected at $t = 0.121\text{ s}$ |
| 8 | Jump Buffering | Kinematics | T1, T2 | `tier1_features.test.js`, `tier2_boundaries.test.js` | Queues jump within $0.12\text{ s}$ of landing; triggers upon grounded |
| 9 | Ground Detection & Slope Glue | Kinematics | T1 | `tier1_features.test.js` | Clamps $y \le 0$ to $0$; applies sticky $v_y = -2.0\text{ m/s}$ when grounded |
| 10 | Shadow Dodge Roll | Kinematics | T1, T3 | `tier1_features.test.js`, `tier3_pairwise.test.js` | $v_x = \text{facing} \times 16.0\text{ m/s}$ for $0.35\text{ s}$, sets `isInvulnerable` |
| 11 | Aerial Plunge | Kinematics | T1, T3 | `tier1_features.test.js`, `tier3_pairwise.test.js` | Mid-air down+attack sets downward velocity, deals ground impact |
| 12 | 3-Hit Light Attack Combo | Combat | T1 | `tier1_features.test.js` | Sequence damages: Hit 1 = $22$, Hit 2 = $28$, Hit 3 = $48$ |
| 13 | Combo Reset Window | Combat | T1, T2 | `tier1_features.test.js`, `tier2_boundaries.test.js` | Advances within $0.65\text{ s}$; resets to Hit 1 if idle $> 0.65\text{ s}$ |
| 14 | Active Hitbox Triggering | Combat | T1 | `tier1_features.test.js` | Hitbox active only during swing window ($0.22\text{ s}$ duration) |
| 15 | Duplicate Hit Prevention | Combat | T1, T2 | `tier1_features.test.js`, `tier2_boundaries.test.js` | `HitTracker` HashSet ignores repeated collision in same swing |
| 16 | Heavy Cleave / Shield Shatter | Combat | T1, T3 | `tier1_features.test.js`, `tier3_pairwise.test.js` | Hold attack ($0.5\text{ s}$) deals high poise damage, breaks tower shields |
| 17 | Hit-Stop Feedback | Combat | T1, T3 | `tier1_features.test.js`, `tier3_pairwise.test.js` | Micro-freeze: Light = $0.04\text{ s}$, Finisher/Crit = $0.08\text{ s}$ |
| 18 | 2.5D Directional Knockback | Combat | T1 | `tier1_features.test.js` | Knockback along X axis with vertical pop $y=0.3$, $Z=0$ |
| 19 | Perfect Parry / Deflection | Defense | T1, T3 | `tier1_features.test.js`, `tier3_pairwise.test.js` | $0.10\text{ s}$ window deflects attacks, $0$ dmg, $+100$ poise dmg, $+100$ res |
| 20 | Poise Break & Riposte | Defense | T1, T3 | `tier1_features.test.js`, `tier3_pairwise.test.js` | Staggered target takes $2.5\times$ critical damage multiplier |
| 21 | Stygian Resonance Gauge | Resources | T1, T3 | `tier1_features.test.js`, `tier3_pairwise.test.js` | Gauge $[0, 100]$: $+15$ per hit, $+100$ per parry, caps at 100 |
| 22 | Overdrive Mode | Resources | T1, T3 | `tier1_features.test.js`, `tier3_pairwise.test.js` | Sustained at $100$ grants $+30\%$ speed & stagger boost; drops $< 100$ |
| 23 | Stygian Lance Spell | Resources | T1, T3 | `tier1_features.test.js`, `tier3_pairwise.test.js` | Consumes $25$ res, fires $16\text{ m}$ railgun beam dealing 55 dmg |
| 24 | Cinder Nova Spell | Resources | T1 | `tier1_features.test.js` | Consumes $40$ res, spawns $r=4.0\text{ m}$ 360-degree area blast |
| 25 | Aegis of Umbra Spell | Resources | T1 | `tier1_features.test.js` | $4.0\text{ s}$ buff absorbs next incoming hit completely and heals 50% HP |
| 26 | Universal Health Model | Resources | T1, T2 | `tier1_features.test.js`, `tier2_boundaries.test.js` | HP $[0, 100]$; clamp against negative health; triggers defeat at $0$ |
| 27 | Post-Damage I-Frames | Resources | T1, T2 | `tier1_features.test.js`, `tier2_boundaries.test.js` | $0.3\text{ s}$ invulnerability window blocks rapid hazard multi-hits |
| 28 | Ashen Longsword ("Penumbra") | Arsenal | T1 | `tier1_features.test.js` | Balanced reach ($2.4\text{ m}$), standard speed ($1.0\times$), 3-hit combo |
| 29 | Executioner's Great-Mace | Arsenal | T1 | `tier1_features.test.js` | Heavy reach ($2.8\text{ m}$), hyper-armor uninterruptible by light hits |
| 30 | Twin Eclipse Daggers | Arsenal | T1 | `tier1_features.test.js` | Fast speed ($1.5\times$), rapid resonance gain ($+25$ per hit) |
| 31 | Deterministic AI FSM | Enemy AI | T1, T4 | `tier1_features.test.js`, `tier4_workloads.test.js` | Moore/Mealy machine: Idle, Patrol, Aggro, Attack, Stagger, Defeated |
| 32 | The Ashen Footman (Grunt) | Enemy AI | T1, T4 | `tier1_features.test.js`, `tier4_workloads.test.js` | Aggro at $8\text{ m}$, attacks at $2\text{ m}$, $0.30\text{ s}$ telegraph glint |
| 33 | Grave-Weaver Crawler | Enemy AI | T1 | `tier1_features.test.js` | Ambush drop triggered when player directly beneath; retreat leap on hit |
| 34 | Cinder-Bough Archer | Enemy AI | T1, T4 | `tier1_features.test.js`, `tier4_workloads.test.js` | Parabolic projectile ($v_0=14\text{ m/s}$); evasive roll/kick if player $< 2\text{ m}$ |
| 35 | The Iron Phalanx | Enemy AI | T1 | `tier1_features.test.js` | Frontal shield blocks light frontal melee; vulnerable to rear or Heavy Cleave |
| 36 | Wisp of the Hollow Crown | Enemy AI | T1 | `tier1_features.test.js` | Flying entity ($y=4\text{ m}$), homing violet orbs, defeat explosion ($r=3\text{ m}$) |
| 37 | Training Dummy Test Subject | Enemy AI | T1, T2 | `tier1_features.test.js`, `tier2_boundaries.test.js` | Flashes red on hit ($0.15\text{ s}$), auto-revives after $2.5\text{ s}$ when depleted |
| 38 | Boss 1: Vael-Krag Phase 1 | Bosses | T1, T4 | `tier1_features.test.js`, `tier4_workloads.test.js` | Bell sweep ($r=4.5\text{ m}$) and seismic ground shockwave ($v=10\text{ m/s}$) |
| 39 | Boss 1: Vael-Krag Phase 2 | Bosses | T1, T4 | `tier1_features.test.js`, `tier4_workloads.test.js` | $\le 50\%$ HP triggers violet fire bell, burning ground pools, leap slam |
| 40 | Boss 2: Lady Morwyn | Bosses | T1 | `tier1_features.test.js` | Fast duellist parry rhythm flurry ($0.2\text{ s}$ gaps) & shrinking thorn walls |
| 41 | Boss 3: Malakor Wyrm-Knight | Bosses | T1 | `tier1_features.test.js` | Dragoon shadow wings, dark fire breath covering floor, vertical evasion |
| 42 | 2.5D Camera Tracking Rail | Camera | T1 | `tier1_features.test.js` | Smooth tracking along X and Y, locked $Z=-12\text{ m}$, $5^\circ$ downward pitch |
| 43 | Forward Look-Ahead Anticipation | Camera | T1 | `tier1_features.test.js` | Camera target offsets $+2.2\text{ m}$ (right) or $-2.2\text{ m}$ (left) |
| 44 | Exponential Screen Shake | Camera | T1, T3 | `tier1_features.test.js`, `tier3_pairwise.test.js` | Trauma decay ($0.35$ finisher, $0.50$ boss slam), $Z$ offset strictly zeroed |
| 45 | Procedural Audio Synthesizer | Presentation | T1 | `tier1_features.test.js` | Audio state triggers (`slash`, `hit`, `spell`, `parry`, `heal`) with ramp params |
| 46 | Visor Glow & Cloak Physics | Presentation | T1 | `tier1_features.test.js` | Visor starlight-blue (`#00D2FF`); cloak angle $\theta = 0.15 + (|v_x|/v_{\max}) \times 0.45$ |
| 47 | Screen-Projected Floating Damage | Presentation | T1 | `tier1_features.test.js` | 3D-to-2D projection calculation; crit styling for $\ge 48$ damage |
| 48 | Checkpoint Sanctuary Shrine | Environment | T1, T4 | `tier1_features.test.js`, `tier4_workloads.test.js` | Proximity check ($< 1.8\text{ m}$) restores HP to 100%, updates respawn anchor |
| 49 | Hardware-Agnostic Input Reader | Controls | T1 | `tier1_features.test.js` | Uniform action mapping from Keyboard, Mouse, Gamepad, Touch |
| 50 | Mobile Virtual Touch Controls | Controls | T1 | `tier1_features.test.js` | Virtual D-Pad (Left/Right) and action buttons (Jump, Attack, Spell, Dodge) |

---

## 4. Test Tiers Overview

### Tier 1: Feature Coverage (`tests/e2e/tier1_features.test.js`)
- **Objective**: Verify that each of the 50 features functions correctly in isolation according to its mathematical model.
- **Coverage**: 50 independent test suites exercising kinematics, attack combos, parry windows, spells, health containers, enemy behaviors, boss logic, camera tracking, and input mapping.

### Tier 2: Boundary & Corner Cases (`tests/e2e/tier2_boundaries.test.js`)
- **Objective**: Stress-test edge conditions, mathematical singularities, and defensive assertions.
- **Scenarios**:
  - Exact coyote time expiration ($t = 0.119\text{s}$ valid, $t = 0.121\text{s}$ expired).
  - Exact jump buffer expiration ($t = 0.119\text{s}$ triggers jump on landing, $t = 0.121\text{s}$ ignored).
  - $Z$-axis drift injection ($z = \pm 100\text{ m} \implies \text{clamped to } 0.0$).
  - Negative and extreme inputs ($u_x = -999$, $u_x = \text{NaN}$, $u_x = \text{Infinity}$).
  - Overkill damage (HP = 10, damage = 9999 $\implies$ HP clamped to 0, defeat triggered once).
  - Excessive healing (HP = 90, heal = 50, max = 100 $\implies$ HP clamped to 100).
  - Armor division-by-zero guard ($\text{Armor} \to -100$ or negative values).
  - Multi-hit duplicate suppression with identical target IDs.
  - Rapid input spam (10 rapid attacks in $0.05\text{ s}$ cleanly buffered without desync).

### Tier 3: Cross-Feature Interactions (`tests/e2e/tier3_pairwise.test.js`)
- **Objective**: Verify pairwise and multi-system integration between mechanics.
- **Scenarios**:
  1. **Jump + Attack**: Mid-air attack maintains horizontal velocity and applies gravity.
  2. **Aerial Plunge (Down + Attack while airborne)**: High downward velocity into landing impact.
  3. **Dodge Roll + I-Frames vs Enemy Strike**: Incoming enemy attack during roll deals $0$ damage.
  4. **Perfect Parry vs Melee Strike**: Guard active within $0.10\text{ s}$ window deflects attack, negates damage, inflicts $100$ poise damage, and grants $+100$ resonance.
  5. **Mistimed Parry**: Guard pressed $> 0.10\text{ s}$ before impact fails deflection and takes full damage.
  6. **Resonance Accumulation -> Stygian Lance**: Attacks build gauge to $25+$; casting Lance consumes $25$, pierces multiple targets, and snipes elevated targets.
  7. **Insufficient Resonance Guard**: Casting Lance with resonance $< 25$ fails cleanly.
  8. **Overdrive Buff Lifecycle**: Reaching 100 resonance activates Overdrive ($+30\%$ speed & stagger); drops when resonance decreases.
  9. **Hit-Stop + Screen Shake Sequence**: Finisher hit triggers $0.08\text{ s}$ micro-freeze and $0.35$ screen trauma.

### Tier 4: Real-World Combat Workloads (`tests/e2e/tier4_workloads.test.js`)
- **Objective**: Full end-to-end combat encounters run through complete multi-second scenarios.
- **Scenarios**:
  1. **Encounter 1: Protagonist vs The Ashen Footman**: Patrol -> Aggro pursuit -> Footman attack telegraph -> Player parry deflection -> Stagger -> 3-hit riposte finisher -> Footman defeat.
  2. **Encounter 2: Protagonist vs Cinder-Bough Archer**: Long range pursuit -> Parabolic flaming arrow fired -> Dodge roll through arrow with I-frames -> Player closes distance -> Archer kicks/rolls -> Player finishes with Stygian Lance snipe.
  3. **Encounter 3: Protagonist vs Boss Vael-Krag (The Gatekeeper)**:
     - Phase 1: Boss HP 100% -> Bell sweep dodged via jump -> Attacks dealt -> Seismic slam avoided -> Boss HP drops to 50%.
     - Phase 2 Transition: Boss ignites violet bell -> Creates burning floor pool -> Executes Leap Slam -> Player dodges landing shockwave with roll I-frames -> Player activates Overdrive at 100 resonance -> Delivers Stygian Lance finisher -> Boss reaches 0 HP and triggers defeat.

### Automated Playtest Simulation Runner (`tests/playtest_runner.js`)
- **Objective**: Headless, deterministic 60Hz tick simulation executing a complete player playtest session from spawn to boss defeat in continuous real-time simulation.
- **Execution**: Ticks the simulation at $\Delta t = 1/60\text{ s}$ across 600 frames, recording player position, inputs, health, resonance, enemy state transitions, and boss phase shifts.

---

## 5. Execution Commands & Pass/Fail Criteria

### Running All E2E Test Tiers:
```powershell
node --test tests/e2e/*.test.js
```

### Running the Deterministic Playtest Runner:
```powershell
node tests/playtest_runner.js
```

### Running Individual Test Tiers:
```powershell
node --test tests/e2e/tier1_features.test.js
node --test tests/e2e/tier2_boundaries.test.js
node --test tests/e2e/tier3_pairwise.test.js
node --test tests/e2e/tier4_workloads.test.js
```

### Pass/Fail Criteria:
- **100% Test Pass Rate**: 0 failing test cases across all tiers.
- **Zero Runtime Warnings/Unhandled Exceptions**: No unhandled promise rejections, memory leaks, or NaN coordinates.
- **Deterministic Playtest Exit Code**: `node tests/playtest_runner.js` exits with code `0` and outputs `ALL PLAYTEST WORKLOADS PASSED`.
