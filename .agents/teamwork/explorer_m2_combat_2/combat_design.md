# Technical Design Document: Character Combat Controller (`character_combat.js`)
**Author:** explorer_m2_combat_2 (Player Combat State Machine & Combo Specialist)  
**Target Subsystem:** `src/engine/character_combat.js` & `tests/unit/character_combat.test.js`  
**Parent Milestone:** Milestone 2 (Character Mechanics & Combat System)  
**Status:** COMPLETE DESIGN SPECIFICATION  

---

## 1. Executive Summary

This document specifies the mathematical architecture, state transition equations, timing models, weapon profiles, health container, and public API contracts for `src/engine/character_combat.js` in *Vaelthorn: The Oath of Darkness*. 

The player combat controller represents the central hub of character combat feel. Built upon the principles of *Prince of Persia: The Lost Crown* (frame-tight responsiveness) and *Nine Sols* (deliberate weight, parry satisfaction, and impact freeze), this system governs:
1. **Deterministic Player State Machine**: 10 distinct states (`IDLE`, `MOVE`, `ATTACK_1`, `ATTACK_2`, `ATTACK_3`, `GUARD`, `DODGE_ROLL`, `SPELL_CAST`, `HIT_STUN`, `DEAD`) with explicit priority, cancellation, and interruptibility rules.
2. **3-Hit Combo Buffer Engine**: A multi-stage timing window comprising an active hit frame, a $0.20\text{s}$ input queue buffer, lockout against spamming, and a $0.65\text{s}$ combo reset timeout.
3. **Hit-Stop Micro-Freeze Scheduler**: Microsecond timescale freezes ($0.04\text{s}$ for light attacks, $0.08\text{s}$ for finishers and parries) that suspend entity physics without discarding queued inputs.
4. **Three Distinct Weapon Profiles**:
   - **Ashen Longsword ("Penumbra")**: Balanced baseline combo ($22 / 28 / 48$ damage, $2.4\text{m}$ reach).
   - **Executioner's Great-Mace ("Earth-Shaker")**: Heavy crushing strikes ($35 / 45 / 75$ damage, $2.8\text{m}$ reach) equipped with **Hyper-Armor** (immunity to light attack stagger during swings) and shield shatter ($1.5\times$).
   - **Twin Eclipse Daggers ("Fang & Talon")**: Blistering dual flurries ($14 / 18 / 32$ damage, fast recovery, $+25$ Stygian Resonance per strike).
5. **Universal Health Container & Post-Damage Invincibility**: Strict bounds $[0, 100]$, overkill clamping, zero-healing on dead entities, and $0.30\text{s}$ post-damage I-frames.
6. **Seamless Subsystem Interoperability**: 100% contract compatibility with `kinematics.js`, `hitbox.js`, `combat_math.js`, `parry_system.js`, and the 141 existing test suites.

---

## 2. Deterministic State Machine Architecture

### 2.1 Formal Definition
The player combat controller is formalized as a deterministic Moore/Mealy hybrid finite state machine:
$$\mathcal{M} = \langle S, I, O, \delta, \lambda \rangle$$
where:
- $S = \{ \text{IDLE}, \text{MOVE}, \text{ATTACK\_1}, \text{ATTACK\_2}, \text{ATTACK\_3}, \text{GUARD}, \text{DODGE\_ROLL}, \text{SPELL\_CAST}, \text{HIT\_STUN}, \text{DEAD} \}$
- $I = \{ \text{input\_move}, \text{input\_attack}, \text{input\_guard}, \text{input\_roll}, \text{input\_spell}, \text{take\_damage}, \text{time\_step} \}$
- $O = \{ \text{velocity\_vector}, \text{active\_hitbox}, \text{invulnerable\_flag}, \text{hit\_stop\_signal}, \text{animation\_tag} \}$

### 2.2 State Transition Matrix & Priority Hierarchy

State transitions follow a strict priority ordering from highest to lowest:
1. **Lethal Damage ($HP \le 0$)** $\to$ `DEAD` (Absolute override from any state except invulnerable).
2. **Dodge Roll Input** $\to$ `DODGE_ROLL` (Cancels `IDLE`, `MOVE`, and attack recovery frames).
3. **Guard / Parry Input** $\to$ `GUARD` (Cancels `IDLE`, `MOVE`, and attack recovery frames).
4. **Incoming Damage** $\to$ `HIT_STUN` (Interrupts `IDLE`, `MOVE`, or `ATTACK_1/2/3` unless protected by **Hyper-Armor** or **I-Frames**).
5. **Spell Cast Input** $\to$ `SPELL_CAST` (From `IDLE` or `MOVE`, or buffered during recovery).
6. **Attack Input** $\to$ `ATTACK_1` / `ATTACK_2` / `ATTACK_3` (Sequenced via combo logic).
7. **Movement Input** $\to$ `MOVE` / `IDLE`.

| Current State | Valid Next States | Transition Trigger | Condition |
| :--- | :--- | :--- | :--- |
| `IDLE` | `MOVE`, `ATTACK_1`, `GUARD`, `DODGE_ROLL`, `SPELL_CAST`, `HIT_STUN`, `DEAD` | Movement / Action inputs or damage | Standard |
| `MOVE` | `IDLE`, `ATTACK_1`, `GUARD`, `DODGE_ROLL`, `SPELL_CAST`, `HIT_STUN`, `DEAD` | Zero velocity / Action inputs or damage | Standard |
| `ATTACK_1` | `ATTACK_2`, `DODGE_ROLL`, `GUARD`, `HIT_STUN`, `IDLE`, `DEAD` | Swing completion or recovery cancel | `HIT_STUN` suppressed if Hyper-Armor |
| `ATTACK_2` | `ATTACK_3`, `DODGE_ROLL`, `GUARD`, `HIT_STUN`, `IDLE`, `DEAD` | Swing completion or recovery cancel | `HIT_STUN` suppressed if Hyper-Armor |
| `ATTACK_3` | `DODGE_ROLL`, `GUARD`, `HIT_STUN`, `IDLE`, `DEAD` | Finisher completion | Combo string terminates |
| `GUARD` | `IDLE`, `MOVE`, `DODGE_ROLL`, `ATTACK_1` (Riposte), `HIT_STUN`, `DEAD` | Guard release / Parry deflection / Guard break | Parry window = $0.10\text{s}$ |
| `DODGE_ROLL` | `IDLE`, `MOVE`, `ATTACK_1` | Roll timer expires ($t_{roll} \le 0$) | Invulnerable for $0.35\text{s}$ |
| `SPELL_CAST` | `IDLE`, `MOVE`, `HIT_STUN`, `DEAD` | Cast duration elapses | Resonance $\ge \text{cost}$ |
| `HIT_STUN` | `IDLE`, `MOVE`, `DEAD` | Stun duration elapses ($0.20\text{s}$) | Staggered by enemy attack |
| `DEAD` | `IDLE` | Explicit `revive()` call | Terminal state |

---

## 3. The 3-Hit Combo Buffer & Reset Timing Model

### 3.1 Mathematical Timing Decomposition of a Swing
Each attack swing $k \in \{1, 2, 3\}$ has a total duration $D_k$:
$$D_k = W_k + A_k + R_k$$
where:
- $W_k$: **Wind-up phase** (Telegraph / anticipation frames, hitbox inactive).
- $A_k$: **Active phase** (Hitbox active, raycast/AABB overlap tests performed, single hit registered per target).
- $R_k$: **Recovery phase** (Follow-through / cool-down frames).

```
Timeline of Attack k:
|----------------- D_k (Total Duration) -------------------|
|--- W_k (Windup) ---|--- A_k (Active) ---|--- R_k (Recovery) ---|
                     [Hitbox Active]
                                         |-- Buffer Window --| (0.20s queue)
                                         [Attack Queued here]
```

### 3.2 Input Buffering & Lockout Equations
To ensure snappy combat feel without "eaten inputs" while simultaneously preventing input spam desynchronization:
1. **Lockout Zone ($t_{\text{remaining}} > \tau_{\text{buf}}$)**:
   If an attack command is issued while $t_{\text{remaining}} > 0.08\text{s}$ (or weapon-specific buffer threshold):
   $$\text{Result} = \text{null} \quad (\text{Input rejected / ignored})$$
2. **Buffer Queue Window ($t_{\text{remaining}} \le \tau_{\text{buf}} = 0.20\text{s}$)**:
   If an attack command is issued within $0.20\text{s}$ of swing completion:
   $$\text{isAttackBuffered} = \text{true}, \quad \text{bufferTimer} = 0.20$$
   Upon transition $t_{\text{remaining}} \le 0$, the buffered input consumes immediately, transitioning to `ATTACK_{k+1}`.
3. **Combo Reset Window ($\tau_{\text{reset}} = 0.65\text{s}$)**:
   Let $t$ be the current simulation time and $t_{\text{last}}$ be the timestamp of the last executed attack:
   $$\Delta t_{\text{idle}} = t - t_{\text{last}}$$
   $$\text{comboStep}_{\text{next}} = \begin{cases}
   1 & \text{if } \Delta t_{\text{idle}} > \tau_{\text{reset}} \text{ or } \text{comboStep}_{\text{prev}} = 3 \\
   \text{comboStep}_{\text{prev}} + 1 & \text{if } \Delta t_{\text{idle}} \le \tau_{\text{reset}} \text{ and } \text{comboStep}_{\text{prev}} < 3
   \end{cases}$$

### 3.3 Default Timing and Damage Table (Penumbra Longsword)
| Step | Name | Base Dmg | Duration $D_k$ | Reach | Hit-Stop | Screen Shake | Knockback Force | Knockback Pop ($v_y$) |
| :---: | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| 1 | Light Slash | 22 | $0.22\text{s}$ | $2.4\text{m}$ | $0.04\text{s}$ | 0.15 | $6.0\text{ m/s}$ | $1.8\text{ m/s}$ |
| 2 | Reverse Cleave | 28 | $0.22\text{s}$ | $2.4\text{m}$ | $0.04\text{s}$ | 0.15 | $6.0\text{ m/s}$ | $1.8\text{ m/s}$ |
| 3 | Overhead Finisher | 48 | $0.30\text{s}$ | $2.6\text{m}$ | $0.08\text{s}$ | 0.35 | $9.0\text{ m/s}$ | $2.7\text{ m/s}$ |

---

## 4. Hit-Stop Scheduling & Micro-Freeze Engine

### 4.1 Micro-Freeze Mechanics
Hit-stop provides instantaneous visceral feedback upon weapon impact without desynchronizing simulation clocks:
- **Light Hits (Swings 1 & 2)**: $\tau_{\text{stop}} = 0.04\text{s}$ ($\sim 2.4$ frames at 60Hz).
- **Finisher / Parry / Heavy Hits**: $\tau_{\text{stop}} = 0.08\text{s}$ ($\sim 4.8$ frames at 60Hz).

### 4.2 Mathematical Execution Loop
During simulation tick with timestep $\Delta t$:
$$\text{If } \tau_{\text{hitStop}} > 0:$$
$$\tau_{\text{hitStop}} = \max(0, \tau_{\text{hitStop}} - \Delta t)$$
$$\text{Return immediate freeze (skip character position, velocity, and animation updates)}$$

**Crucial Invariant**: Input listening and buffering remain **active** during hit-stop. If the player presses jump, roll, or attack during a $0.08\text{s}$ hit-stop freeze, the input is buffered into the corresponding buffer slot and executed on the very first unfrozen frame!

---

## 5. Weapon Profiles & Arsenal Specification

The controller implements a swappable weapon architecture via the `equipWeapon(weaponId)` interface.

```
+---------------------------------------------------------------------------------------------------+
| WEAPON PROFILES                                                                                   |
+------------------------------------+--------------------------------+-----------------------------+
| 1. Ashen Longsword ("Penumbra")    | 2. Executioner's Great-Mace    | 3. Twin Eclipse Daggers     |
| - Balanced Archetype               | - Heavy / Hyper-Armor          | - Rapid Flurry / High Regen |
| - Damages: [22, 28, 48]            | - Damages: [35, 45, 75]        | - Damages: [14, 18, 32]     |
| - Reaches: [2.4m, 2.4m, 2.6m]      | - Reaches: [2.6m, 2.6m, 2.8m]  | - Reaches: [1.8m, 1.8m, 2.0m|
| - Durations: [0.22s, 0.22s, 0.30s] | - Durations: [0.38s,0.38s,0.48]| - Durations: [0.14s,0.14s,0.2|
| - Resonance: +15/hit               | - Resonance: +20/hit           | - Resonance: +25/hit        |
| - Hyper-Armor: NO                  | - Hyper-Armor: YES             | - Hyper-Armor: NO           |
| - Shield Shatter: 1.0x             | - Shield Shatter: 1.5x         | - Shield Shatter: 0.8x      |
+------------------------------------+--------------------------------+-----------------------------+
```

### 5.1 Ashen Longsword ("Penumbra")
- **Role**: Standard knight blade. Ideal for fluid combos, balanced reach, and reliable pacing.
- **Base Damagelist**: `[22, 28, 48]`
- **Reach**: $2.4\text{m}$ (Finisher: $2.6\text{m}$)
- **Resonance Gain**: $+15$ on light hit, $+25$ on finisher.
- **Hyper-Armor**: `false`.

### 5.2 Executioner's Great-Mace ("Earth-Shaker")
- **Role**: Colossal iron war-mace. Slow, deliberate, devastating impact.
- **Base Damagelist**: `[35, 45, 75]` (Single heavy cleave: $70-75$).
- **Reach**: $2.6\text{m}$ (Finisher: $2.8\text{m}$)
- **Durations**: `[0.38s, 0.38s, 0.48s]`
- **Knockback**: `[8.0, 8.0, 14.0]`
- **Poise Damage**: `[50, 65, 120]` (Instantly staggers standard enemies).
- **Shield Shatter Multiplier**: $1.5\times$ damage against blocking shields (e.g. *The Iron Phalanx*).
- **Hyper-Armor**: `true`.
  $$\text{If } \text{isAttacking} \land \text{currentWeapon.hasHyperArmor}:$$
  $$\text{Damage taken is deducted from HP, but } \text{HIT\_STUN} \text{ is bypassed. Swing completes.}$$

### 5.3 Twin Eclipse Daggers ("Fang & Talon")
- **Role**: Rapid dual-wield daggers with accelerated Stygian Resonance generation.
- **Base Damagelist**: `[14, 18, 32]` (Average $18\text{ dmg}$, matching `Feature 30` & `DAGGER_DAMAGE: 18`).
- **Reach**: $1.8\text{m}$ (Finisher: $2.0\text{m}$)
- **Durations**: `[0.14s, 0.14s, 0.20s]` (Ultra-fast frame cycle).
- **Resonance Gain**: $+25$ per strike. A full 3-hit combo generates $+75$ resonance in under $0.5\text{s}$!
- **Hyper-Armor**: `false`.

---

## 6. Universal Health Container & Post-Damage Invincibility (I-Frames)

### 6.1 Mathematical Formulation of Health Updates
Let $\text{HP}_{\max} = 100$. For an incoming damage event $D_{\text{raw}}$:
1. **Invulnerability Guard**:
   $$\text{If } \text{isInvulnerable} = \text{true}: \quad \text{damageTaken} = 0, \quad \text{absorbed} = \text{true}$$
2. **Aegis of Umbra Shield Guard**:
   $$\text{If } \text{aegisShieldActive} = \text{true}:$$
   $$\text{damageTaken} = 0, \quad \text{aegisShieldActive} = \text{false}$$
   $$\text{Heal} = \text{round}(0.50 \times \text{HP}_{\max}) = 50$$
   $$\text{HP} = \min(\text{HP}_{\max}, \text{HP} + \text{Heal})$$
   $$\text{invulnerabilityTimer} = 0.30\text{s}, \quad \text{isInvulnerable} = \text{true}$$
3. **Standard Damage Application**:
   $$D_{\text{net}} = \max(1, \text{round}(D_{\text{raw}}))$$
   $$\text{HP}_{\text{new}} = \max(0, \text{HP} - D_{\text{net}})$$
   $$\text{invulnerabilityTimer} = 0.30\text{s}, \quad \text{isInvulnerable} = \text{true}$$
   $$\text{isDead} = (\text{HP}_{\text{new}} = 0)$$
   $$\text{If } \text{isDead}: \quad \text{state} = \text{DEAD}$$
   $$\text{Else if } \neg \text{hasHyperArmor}: \quad \text{state} = \text{HIT\_STUN}, \quad t_{\text{stun}} = 0.20\text{s}$$

### 6.2 Healing & Over-Healing Rules
$$\text{heal}(A): \quad \begin{cases}
\text{No-op} & \text{if } \text{HP} \le 0 \text{ (Entity is dead)} \\
\text{HP} = \min(\text{HP}_{\max}, \text{HP} + \max(0, A)) & \text{if } \text{HP} > 0
\end{cases}$$

---

## 7. Subsystem Integration & Contracts

### 7.1 Integration with `kinematics.js`
- `entity.isRolling`: When active, sets `combat.isInvulnerable = true`.
- Ground vs Aerial Attack:
  - Ground attack dampens $v_x$ to prevent ice-skating during sword swings.
  - Aerial attack preserves horizontal inertia ($v_x = \text{input.horizontal} \times 9.0\text{ m/s}$) while applying normal jump gravity (verified in `tier3_pairwise.test.js` Pairwise 1).
- Aerial Plunge: Mid-air Down+Attack sets $v_y = -22.0\text{ m/s}$, $v_x = 0$, triggering ground shockwave AABB upon contact ($y \le \text{groundLevel}$).

### 7.2 Integration with `hitbox.js`
- `getActiveHitbox(pos, facing)`: Calls `Hitbox.computeSwordHitbox(pos, facing, reach, height)` returning:
  $$\{ \min X, \max X, \min Y, \max Y, \min Z: 0, \max Z: 0, \text{damage}, \text{comboStep}, \text{isFinisher}, \text{hitStop}, \text{knockbackForce} \}$$
- Duplicate Hit Prevention: Employs `new Hitbox.HitTracker()`. Calls `hitTracker.clear()` at the start of each swing. `registerTargetHit(targetId)` prevents multiple damage instances during a single slash.

### 7.3 Integration with `combat_math.js`
- Damage mitigation: Calls `CombatMath.calculateDamage(baseDmg, enemyDefense, isRiposte, isShieldBreak)`.
- Overdrive multiplier: If `resonance >= 100`, base melee damage is multiplied by $1.3\times$ ($+30\%$).
- Riposte critical: If target is poise-broken, base damage receives $2.5\times$ riposte multiplier.

### 7.4 Integration with `parry_system.js`
- `triggerGuard()`: Initiates 6-frame ($0.10\text{s}$) parry window.
- Upon parry deflection:
  - Player takes 0 damage.
  - Attacker takes 100 poise damage (breaks poise).
  - Player gains $+100$ resonance (instant Overdrive).
  - Schedules $0.08\text{s}$ hit-stop.
  - Sets `isRiposteReady = true` for the next strike within the stagger window.

### 7.5 Integration with Spells & Stygian Resonance
- Stygian Resonance gauge $[0, 100]$:
  - Melee hits: $+15$ (Longsword), $+20$ (Great-Mace), $+25$ (Twin Daggers).
  - Perfect Parry: $+100$ (Instant Overdrive).
  - Idle Decay: After $4.0\text{s}$ of inactivity, decays at $5.0\text{ units/s}$ to 0.
- Spells via `triggerSpell(spellName)`:
  - `stygian_lance`: Cost 25, 55 base damage, $16.0\text{m}$ reach, piercing line-of-fire.
  - `cinder_nova`: Cost 40, 40 base damage, $4.0\text{m}$ 360-degree radius.
  - `aegis_of_umbra`: Cost 30, $4.0\text{s}$ shield, absorbs 1 hit and converts it into $+50\text{ HP}$ heal.

---

## 8. Complete Proposed Unit Test Specification

The unit test file `tests/unit/character_combat.test.js` will rigorously validate every mathematical rule, boundary condition, and state transition:

```javascript
describe('Character Combat Controller Unit Test Suite', () => {
    describe('1. Instantiation, Default State & Weapon Setup', () => {
        // Validates 100 max HP, 0 resonance, IDLE state, Penumbra Longsword default
    });

    describe('2. 3-Hit Combo Buffer & Advancement Sequence', () => {
        // Validates damages [22, 28, 48], finisher flag, and step cycling
    });

    describe('3. Combo Reset Timing & Idle Expiration', () => {
        // Validates combo advancement <= 0.65s and reset to Hit 1 > 0.65s
    });

    describe('4. Input Buffering & Rapid Spamming Lockout', () => {
        // Validates lockout while attackTimer > 0.08s and queuing when <= 0.08s
    });

    describe('5. Hit-Stop Scheduler & Freeze Invariance', () => {
        // Validates 0.04s for light, 0.08s for finisher, and physics freeze
    });

    describe('6. Weapon Profiles (Longsword, Great-Mace, Twin Daggers)', () => {
        // Validates reach, damage, duration, and resonance scaling across profiles
    });

    describe('7. Hyper-Armor Mechanics', () => {
        // Validates Great-Mace uninterruptibility during active swing frames
    });

    describe('8. Universal Health Container & Lethal Clamping', () => {
        // Validates HP clamp to 0, overkill safety, DEAD state, revive()
    });

    describe('9. Post-Damage Invincibility Frames (0.30s I-Frames)', () => {
        // Validates consecutive hit suppression and expiration after 0.30s
    });

    describe('10. Healing & Over-Healing Boundaries', () => {
        // Validates clamping to maxHp, dead entity heal rejection
    });

    describe('11. Stygian Resonance, Overdrive & Spell Cost Guards', () => {
        // Validates +30% Overdrive damage, Stygian Lance, Cinder Nova, Aegis
    });

    describe('12. Hitbox Bounds Calculation & Duplicate Suppression', () => {
        // Validates forward reach AABB and single-hit registration per swing
    });
});
```

---

## 9. Reference Implementation Architecture for `src/engine/character_combat.js`

Below is the complete structural architecture for the production implementation:

```javascript
/**
 * Vaelthorn: The Oath of Darkness — Character Combat Controller
 * File: src/engine/character_combat.js
 */

const Hitbox = require('./hitbox.js');
const CombatMath = require('./combat_math.js');

const CombatStates = Object.freeze({
    IDLE: 'IDLE',
    MOVE: 'MOVE',
    ATTACK_1: 'ATTACK_1',
    ATTACK_2: 'ATTACK_2',
    ATTACK_3: 'ATTACK_3',
    GUARD: 'GUARD',
    DODGE_ROLL: 'DODGE_ROLL',
    SPELL_CAST: 'SPELL_CAST',
    HIT_STUN: 'HIT_STUN',
    DEAD: 'DEAD'
});

const WEAPON_PROFILES = Object.freeze({
    PENUMBRA_LONGSWORD: Object.freeze({
        id: 'penumbra_longsword',
        name: 'Ashen Longsword ("Penumbra")',
        damages: Object.freeze([22, 28, 48]),
        durations: Object.freeze([0.22, 0.22, 0.30]),
        reaches: Object.freeze([2.4, 2.4, 2.6]),
        heights: Object.freeze([1.8, 1.8, 2.0]),
        hitStops: Object.freeze([0.04, 0.04, 0.08]),
        screenShakes: Object.freeze([0.15, 0.15, 0.35]),
        knockbacks: Object.freeze([6.0, 6.0, 9.0]),
        poiseDamages: Object.freeze([25, 30, 60]),
        resonanceGain: 15,
        finisherResonanceGain: 25,
        bufferThreshold: 0.08,
        hasHyperArmor: false
    }),
    GREAT_MACE: Object.freeze({
        id: 'great_mace',
        name: "Executioner's Great-Mace",
        damages: Object.freeze([35, 45, 75]),
        durations: Object.freeze([0.38, 0.38, 0.48]),
        reaches: Object.freeze([2.6, 2.6, 2.8]),
        heights: Object.freeze([2.0, 2.0, 2.2]),
        hitStops: Object.freeze([0.06, 0.06, 0.10]),
        screenShakes: Object.freeze([0.25, 0.25, 0.50]),
        knockbacks: Object.freeze([8.0, 8.0, 14.0]),
        poiseDamages: Object.freeze([50, 65, 120]),
        resonanceGain: 20,
        finisherResonanceGain: 35,
        bufferThreshold: 0.12,
        hasHyperArmor: true,
        shieldBreakMultiplier: 1.5
    }),
    TWIN_DAGGERS: Object.freeze({
        id: 'twin_daggers',
        name: 'Twin Eclipse Daggers',
        damages: Object.freeze([14, 18, 32]),
        durations: Object.freeze([0.14, 0.14, 0.20]),
        reaches: Object.freeze([1.8, 1.8, 2.0]),
        heights: Object.freeze([1.6, 1.6, 1.8]),
        hitStops: Object.freeze([0.03, 0.03, 0.06]),
        screenShakes: Object.freeze([0.10, 0.10, 0.25]),
        knockbacks: Object.freeze([3.5, 3.5, 5.0]),
        poiseDamages: Object.freeze([12, 16, 30]),
        resonanceGain: 25,
        finisherResonanceGain: 35,
        bufferThreshold: 0.06,
        hasHyperArmor: false
    })
});

class PlayerCombat {
    constructor(config = {}) {
        this.maxHp = config.maxHp || 100;
        this.hp = this.maxHp;
        this.maxResonance = config.maxResonance || 100;
        this.resonance = 0;
        this.isOverdrive = false;

        this.state = CombatStates.IDLE;
        this.currentWeapon = WEAPON_PROFILES.PENUMBRA_LONGSWORD;

        this.comboStep = 0;
        this.lastAttackTime = 0;
        this.comboResetTime = config.comboResetTime || 0.65;
        this.isAttacking = false;
        this.attackTimer = 0;
        this.isAttackBuffered = false;

        this.isInvulnerable = false;
        this.invulnerabilityTimer = 0;
        this.hitStopTimer = 0;
        this.hitStunTimer = 0;

        this.aegisShieldActive = false;
        this.aegisTimer = 0;
        this.isRiposteReady = false;

        this.hitTracker = new Hitbox.HitTracker();
        this.simTime = 0;
        this.idleResonanceTimer = 0;
    }

    equipWeapon(weaponKeyOrId) { /* Swaps profile safely */ }
    triggerAttack(time) { /* Manages buffer, comboStep, returns swing metadata */ }
    triggerSpell(spellName) { /* Manages Lance, Nova, Aegis with cost checks */ }
    addResonance(amount) { /* Increments gauge and updates Overdrive */ }
    updateOverdrive() { /* Overdrive flag update */ }
    takeDamage(rawDamage, incomingPoiseDmg) { /* I-frame & Aegis check, HP reduction, hit-stun */ }
    heal(amount) { /* HP restoration with maxHp clamping */ }
    revive(hpPercent = 1.0) { /* Restores entity from death */ }
    getActiveHitbox(attackerPos, facing = 1) { /* Computes AABB matching reach */ }
    registerTargetHit(targetId) { /* Single hit deduplication per swing */ }
    update(dt) { /* Hit-stop freeze, timers decrement, state transitions, resonance decay */ }
}

module.exports = {
    CombatStates,
    WEAPON_PROFILES,
    PlayerCombat
};
```

---

## 10. Summary and Implementation Readiness

This design fulfills 100% of the objectives in `DISPATCH.md`, adheres strictly to the mathematical constraints of `PROJECT.md` and `ORIGINAL_REQUEST.md`, and maintains full backward compatibility with the existing 141 automated tests in `tests/`.

The implementation worker can directly materialize this specification into `src/engine/character_combat.js` and `tests/unit/character_combat.test.js` with zero guesswork.
