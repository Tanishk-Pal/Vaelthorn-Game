# Project: Vaelthorn: The Oath of Darkness

## Architecture
- **Target Platform**: Standalone 3D WebGL / HTML5 with modular pure-mathematical JavaScript core.
  - *Rationale*: Confirmed by multi-agent survey (neither Unity nor dotnet is installed on the host environment; Node.js v24.19.0, npm, Chrome, Edge, and WebGL runtimes are native and operational). The standalone WebGL architecture delivers immediate, zero-installation, robust 60fps playability and headless automated testability.
- **Subsystem Architecture**:
  1. `src/engine/kinematics.js`: Kinematics integration, jump mechanics ($v = \sqrt{2gh}$, gravity multipliers), coyote time, jump buffering, dodge roll, and $Z=0$ 2.5D plane lock.
  2. `src/engine/hitbox.js`: 2.5D geometric overlap calculations ($[x_{min}, x_{max}] \times [y_{min}, y_{max}]$), duplicate hit suppression, raycasts, and knockback vector projection.
  3. `src/engine/combat_math.js`: Damage mitigation, poise damage, resonance accumulation, combo scaling, and projectile parabolic arcs.
  4. `src/engine/parry_system.js`: 6-frame ($0.10\text{s}$) parry timing window, deflection state, poise break window, and riposte multiplier.
  5. `src/engine/character_combat.js`: Kaelen player combat controller, 3-hit combo buffer, hit-stop scheduling, Stygian Resonance gauge, and Stygian Lance spell.
  6. `src/engine/enemy_ai_fsm.js`: Deterministic Moore/Mealy state machine (Idle, Patrol, Aggro, Attack, Stagger, Defeat) for standard enemies (Ashen Footman, Cinder Archer, Training Dummy).
  7. `src/engine/boss_encounter.js`: Multi-phase boss controller for *Vael-Krag, The Weeping Gatekeeper* (Phase 1: Sweep & Seismic Slam; Phase 2: Burning Ground & Leap Slam; defeat trigger).
  8. `Vaelthorn_Playable_Prototype.html`: Unified production-ready game runtime embedding Three.js 3D renderer, procedural Web Audio synthesizer, visual FX, HUD, and input bridge.
  9. `tests/`: Automated test suite running via `node --test` covering all mathematical algorithms, state transitions, and an end-to-end headless playtest simulation runner (`tests/playtest_runner.js`).

## Code Layout
```
E:\Vaelthorn\
├── src\
│   └── engine\
│       ├── kinematics.js
│       ├── hitbox.js
│       ├── combat_math.js
│       ├── parry_system.js
│       ├── character_combat.js
│       ├── enemy_ai_fsm.js
│       └── boss_encounter.js
├── tests\
│   ├── unit\
│   │   ├── kinematics.test.js
│   │   ├── hitbox.test.js
│   │   ├── combat_math.test.js
│   │   ├── parry_system.test.js
│   │   ├── character_combat.test.js
│   │   ├── enemy_ai_fsm.test.js
│   │   └── boss_encounter.test.js
│   ├── e2e\
│   │   ├── tier1_features.test.js
│   │   ├── tier2_boundaries.test.js
│   │   ├── tier3_pairwise.test.js
│   │   └── tier4_workloads.test.js
│   └── playtest_runner.js
├── Vaelthorn_Playable_Prototype.html
├── Docs\
├── PROJECT.md
├── TEST_INFRA.md
├── TEST_READY.md
└── .agents\
```

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | 2.5D Plane Constraint | Character & entities strictly clamped to $Z=0$ plane | M1 | survey |
| 2 | Horizontal Locomotion & Accel | Smooth running along X axis ($8.5-9.0\text{ m/s}$) | M1 | survey |
| 3 | Directional Facing Flip | Sprite/mesh flips $\pm 90^\circ$ on directional input | M1 | survey |
| 4 | Full Jump Kinematics | Parabolic jump ($v_{y0} = \sqrt{2gh}$, $h=2.4\text{ m}$) | M1 | survey |
| 5 | Variable Jump Cut | Releasing jump applies $2.2\times g$ low hop gravity | M1 | survey |
| 6 | Snappy Falling Gravity | Downward descent applies $1.6\times g$ gravity | M1 | survey |
| 7 | Coyote Time | $0.12\text{ s}$ grace window to jump after ledge walk-off | M1 | survey |
| 8 | Jump Buffering | $0.12\text{ s}$ queue window to trigger jump on landing | M1 | survey |
| 9 | Ground Detection & Slope Glue | Ground check with sticky downward velocity | M1 | survey |
| 10 | Shadow Dodge Roll | $v_x = \pm 16\text{ m/s}$ dash for $0.35\text{ s}$ with I-frames | M1 | survey |
| 11 | Aerial Plunge | Mid-air down+attack shockwave plunge | M1 | survey |
| 12 | 3-Hit Light Attack Combo | Sequence of 3 fluid strikes ($22, 28, 48$ damage) | M2 | survey |
| 13 | Combo Reset Window | Combo advances within $0.65\text{ s}$; resets if idle | M2 | survey |
| 14 | Active Hitbox Triggering | Collider active only during active swing frames | M1 | survey |
| 15 | Duplicate Hit Prevention | Per-swing Set tracking targets to prevent double damage | M1 | survey |
| 16 | Heavy Cleave / Shield Shatter | Hold attack ($0.5\text{ s}$) high-poise break attack | M2 | survey |
| 17 | Hit-Stop Feedback | Micro-freeze ($0.04-0.08\text{ s}$) upon hit impact | M2 | survey |
| 18 | 2.5D Directional Knockback | Displaces target along X axis with slight Y pop, $Z=0$ | M1 | survey |
| 19 | Perfect Parry / Deflection | 6-frame ($0.10\text{ s}$) timing window deflecting attacks | M2 | survey |
| 20 | Poise Break & Riposte | Staggered enemy vulnerable to critical counter-attack | M2 | survey |
| 21 | Stygian Resonance Gauge | $0-100$ gauge gained via hits ($+15$) and parries ($+100$) | M2 | survey |
| 22 | Overdrive Mode | $+30\%$ speed & stagger while gauge sustained at 100 | M2 | survey |
| 23 | Stygian Lance Spell | 16m piercing railgun beam (Cost: 25 Resonance, 55 dmg) | M2 | survey |
| 24 | Cinder Nova Spell | 360-degree ground-slam black fire blast | M2 | survey |
| 25 | Aegis of Umbra Spell | 4-second protective runic shield absorbing hit | M2 | survey |
| 26 | Universal Health Model | HP container managing damage, healing, death events | M1 | survey |
| 27 | Post-Damage I-Frames | $0.3\text{ s}$ invincibility blocking hazard multi-hits | M1 | survey |
| 28 | Ashen Longsword ("Penumbra") | Balanced primary weapon with combo swings | M2 | survey |
| 29 | Executioner's Great-Mace | Heavy weapon with hyper-armor against light stagger | M2 | survey |
| 30 | Twin Eclipse Daggers | Rapid dual blades with high resonance generation | M2 | survey |
| 31 | Deterministic AI FSM | Moore/Mealy machine: Idle, Patrol, Aggro, Attack, Stagger, Death | M3 | survey |
| 32 | The Ashen Footman (Grunt) | Patrol melee enemy with telegraphed 2-hit slash | M3 | survey |
| 33 | Grave-Weaver Crawler | Skirmisher with ambush drop and retreat leap | M3 | survey |
| 34 | Cinder-Bough Archer | Sniper with parabolic trajectory flaming stakes | M3 | survey |
| 35 | The Iron Phalanx | Frontal tower shield blocking light frontal attacks | M3 | survey |
| 36 | Wisp of the Hollow Crown | Flying entity with homing orbs and defeat explosion | M3 | survey |
| 37 | Training Dummy Test Subject | Sandbox dummy that flashes, displays damage, auto-revives | M3 | survey |
| 38 | Boss 1: Vael-Krag Phase 1 | Bell club sweep ($r=4.5\text{ m}$) & seismic floor shockwave | M3 | survey |
| 39 | Boss 1: Vael-Krag Phase 2 | Violet fire bell, burning ground pools, leap slam | M3 | survey |
| 40 | Boss 2: Lady Morwyn | Fast duellist with parry rhythm test & thorn walls | M3 | survey |
| 41 | Boss 3: Malakor Wyrm-Knight | Dragoon with shadow wings & dark fire breath | M3 | survey |
| 42 | 2.5D Camera Tracking Rail | Camera follows player smoothly, locked $Z=-12\text{ m}$, $5^\circ$ pitch | M4 | survey |
| 43 | Forward Look-Ahead | Camera anticipates movement direction by $1.5\text{ m}$ | M4 | survey |
| 44 | Exponential Screen Shake | Decay shake on heavy hits, finishers, and boss slams | M4 | survey |
| 45 | Procedural Audio Synthesizer | Web Audio synth for slash, hit, parry, spell, heal sounds | M4 | survey |
| 46 | Visor Glow & Cloak Physics | Glowing visor slit (`#00D2FF`) and velocity-tilted cloak | M4 | survey |
| 47 | Floating Damage Numbers | 3D-to-2D projected floating damage text with crit styles | M4 | survey |
| 48 | Checkpoint Sanctuary Shrine | Obelisk shrine saving respawn, healing HP to 100% | M4 | survey |
| 49 | Hardware-Agnostic Input | Keyboard, mouse, gamepad, and touch event mapping | M4 | survey |
| 50 | Mobile Virtual Touch Controls | On-screen virtual D-Pad and action buttons | M4 | survey |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Kinematics & Hitbox Math Engine | `src/engine/kinematics.js`, `hitbox.js`, `combat_math.js` (65 unit tests, 76 E2E, 270 playtest ticks, swept CCD, zero-allocation SAT, quadratic ballistics) | none | DONE |
| M2 | Character Mechanics & Combat System | `src/engine/parry_system.js`, `character_combat.js` | M1 | IN_PROGRESS |
| M3 | Deterministic Enemy AI & Boss Encounter | `src/engine/enemy_ai_fsm.js`, `boss_encounter.js` | M1, M2 | PLANNED |
| M4 | Production Runtime Integration & Polish | `Vaelthorn_Playable_Prototype.html` (modular engine integration, audio, visual FX, HUD) | M1, M2, M3 | PLANNED |
| M5 | Final Verification & Adversarial Hardening | Pass 100% E2E tests (Tiers 1-4) + Tier 5 Adversarial Coverage | M4, E2E-Track | PLANNED |

## Interface Contracts
### `kinematics.js` ↔ `character_combat.js` & `Vaelthorn_Playable_Prototype.html`
- `updateKinematics(entity, input, dt, config)`:
  - Input: `entity` `{ x, y, z, vx, vy, vz, isGrounded, facing, coyoteTimer, jumpBufferTimer, isRolling, rollTimer, rollCooldown }`
  - Input: `input` `{ horizontal: [-1..1], jumpPressed: bool, jumpHeld: bool, rollPressed: bool }`
  - Return: updated kinematics state strictly clamped to $z=0$, bounded velocity, no NaNs.
- `executeJump(entity, config)`: calculates $v_{y0} = \sqrt{2 \cdot |g| \cdot h}$.
- `executeRoll(entity, config)`: initiates roll with $v_x = \text{facing} \times v_{roll}$, I-frames active for duration.

### `hitbox.js` ↔ `character_combat.js` & `enemy_ai_fsm.js`
- `check2DOverlap(boxA, boxB)`: checks AABB overlap in 2.5D plane ($X$ and $Y$ dimensions).
- `calculateKnockback(attackerPos, targetPos, force)`: returns `{ vx, vy, vz: 0 }` with slight Y pop ($0.3$).
- `HitTracker`: class providing `hasHit(targetId)` and `registerHit(targetId)` to suppress duplicate hits in a single swing.

### `parry_system.js` ↔ `character_combat.js` & `enemy_ai_fsm.js`
- `ParrySystem`:
  - `triggerGuard()`: opens parry window ($0.10\text{s}$, 6 frames).
  - `evaluateIncomingHit(incomingAttack)`:
    - If parry window active: returns `{ result: 'PARRIED', damageTaken: 0, enemyPoiseDamage: 100, resonanceGain: 100, hitStop: 0.08 }`.
    - Else: returns `{ result: 'HIT', damageTaken: incomingAttack.damage, enemyPoiseDamage: 0, resonanceGain: 0 }`.

### `enemy_ai_fsm.js` ↔ `boss_encounter.js` & Runtime
- `updateEnemyFSM(enemy, player, dt)`:
  - States: `IDLE`, `PATROL`, `AGGRO`, `ATTACK_WINDUP`, `ATTACK_ACTIVE`, `ATTACK_RECOVERY`, `STAGGER`, `DEFEATED`.
  - Deterministic transition rules based on distance thresholds ($R_{aggro}=8.0$, $R_{attack}=2.0$), telegraph timer ($0.30\text{s}$), and health.
  - Returns output actions: `{ state, vx, activeHitbox, telegraphActive, damageDealt }`.

### `boss_encounter.js` ↔ Runtime
- `VaelKragBoss`:
  - State machine handling Phase 1 ($>50\%$ HP: Bell Sweep, Seismic Slam) and Phase 2 ($\le 50\%$ HP: Violet Fire Bell, Burning Ground Pools, Leap Slam).
  - Arena bounds: $x \in [-20, 20]$.
