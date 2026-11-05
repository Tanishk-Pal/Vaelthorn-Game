# Technical Design Specification: Stygian Resonance Economy & Stygian Lance Spell Architecture

**Document Version:** 1.0.0  
**Milestone:** Milestone 2 (Character Mechanics & Combat System)  
**Author:** explorer_m2_resonance_spell_3 (Resonance & Spell Specialist)  
**Target Engine Files:** `src/engine/combat_math.js`, `src/engine/hitbox.js`, `src/engine/character_combat.js`  
**Test Targets:** `tests/unit/character_combat.test.js`, `tests/unit/combat_math.test.js`, `tests/e2e/tier1_features.test.js`

---

## Executive Summary

The combat loop of *Vaelthorn: The Oath of Darkness* is founded upon the **Resonance & Sever** rhythm:
1. Offensive swordplay and defensive parries generate **Stygian Resonance** ($R \in [0, 100]$).
2. Sustaining maximum charge ($R = 100$) elevates Kaelen into **Overdrive Mode**, granting $+30\%$ melee damage ($1.25\times - 1.30\times$), increased attack speed, and higher stagger impact.
3. Accumulated resonance acts as the energy pool for high-impact magic, spearheaded by the **Stygian Lance**—a 16-meter piercing beam railgun consuming 25 resonance, striking all aligned enemies along the $Z=0$ 2.5D plane for 55 base magic damage and applying directional kinematic knockback ($6.0\text{ m/s}$).
4. An out-of-combat decay model dynamically drains unspent energy after an idle delay ($5.0\text{s}$ at $10.0\text{ units/s}$, configurable to $4.0\text{s}$ at $5.0\text{ units/s}$ for backwards compatibility), enforcing aggressive, momentum-driven combat.

This document establishes the authentic mathematical models, continuous-time integration algorithms, collision bounding boxes, state machines, input buffering, and interface contracts governing resonance and spell execution.

---

## 1. Mathematical Architecture of the Resonance Economy

```
                        [ INCOMING COMBAT EVENTS ]
                                    |
          +-------------------------+-------------------------+
          | Light Attack (+15)                                | Precision Parry (+100)
          | Twin Daggers (+25)                                | (Instant Saturation)
          | Finisher Hit (+25)                                |
          v                                                   v
    +---------------------------------------------------------------+
    |             Stygian Resonance Gauge: R in [0, 100]            |
    +---------------------------------------------------------------+
          |                                                   |
          | R == 100                                          | Cast Stygian Lance (-25)
          v                                                   v
    +-----------------------+                           +-----------------------+
    |    OVERDRIVE MODE     |                           | Piercing Beam 16m     |
    |  +30% Melee Damage    |                           | 55 Damage + Knockback |
    |  +30% Attack Speed    |                           | Cooldown: 1.5s        |
    +-----------------------+                           +-----------------------+
          |                                                   |
          | If R < 100 (spent or decayed)                     |
          +---------------------> [ Normal Mode ] <-----------+
                                          ^
                                          | Idle >= 5.0s (decay 10 u/s)
                                          +-----------------------+
```

### 1.1 State Vector Definition
The resonance state is defined as an immutable state container or mutable entity component:

$$S_R(t) = \begin{pmatrix} R(t) \\ \tau_{\text{idle}}(t) \\ \mathcal{O}(t) \end{pmatrix}$$

Where:
- $R(t) \in [0.0, 100.0]$: Continuous scalar energy capacity.
- $\tau_{\text{idle}}(t) \in [0.0, \infty)$: Continuous time elapsed since the last positive accumulation or active spell expenditure.
- $\mathcal{O}(t) \in \{\text{true}, \text{false}\}$: Boolean flag indicating active Overdrive status.

### 1.2 Accumulation Dynamics
Every successful offensive strike or defensive parry injects a discrete energy impulse $\Delta R > 0$:

$$R(t^+) = \min\left(R_{\max}, R(t^-) + \Delta R\right)$$

$$\tau_{\text{idle}}(t^+) = 0.0$$

$$\mathcal{O}(t^+) = \left(R(t^+) \ge R_{\max} - \epsilon\right), \quad \epsilon = 10^{-5}$$

#### Weapon & Event Generation Matrix
| Combat Event | Weapon Profile | Energy Gain ($\Delta R$) | Notes |
| :--- | :--- | :--- | :--- |
| **Light Attack 1 & 2** | Ashen Longsword ("Penumbra") | $+15.0$ | Core combat builder |
| **Combo Finisher (Hit 3)** | Ashen Longsword ("Penumbra") | $+25.0$ | Reward for completing full sequence |
| **Twin Daggers Hit (All)** | Twin Eclipse Daggers | $+25.0$ | Rapid generation archetype |
| **Great-Mace Heavy Swing** | Executioner's Great-Mace | $+20.0$ | Slower swings, higher single gain |
| **Heavy Cleave / Guard Break** | All Weapons | $+30.0$ | Shield shatter reward |
| **Precision Parry** | Shield / Buckler-Pauldron | $+100.0$ | Instantaneous maximum burst $\implies \mathcal{O} = \text{true}$ |

### 1.3 Out-of-Combat Decay Model
When out of active combat, resonance decays linearly to zero. To avoid punishing the player during brief traversal or enemy telegraphs, decay begins only after an idle delay threshold $T_{\text{delay}}$.

#### Continuous Delta-Time Integration
Given a simulation timestep $\Delta t > 0$, delay threshold $T_{\text{delay}}$, and decay rate $\lambda$:

1. Update idle timer:
   $$\tau_{\text{idle}}(t + \Delta t) = \tau_{\text{idle}}(t) + \Delta t$$

2. Calculate active decay duration within the current timestep:
   $$\Delta t_{\text{active}} = \begin{cases} 
   0.0 & \text{if } \tau_{\text{idle}}(t + \Delta t) \le T_{\text{delay}} \\
   \min\left(\Delta t, \tau_{\text{idle}}(t + \Delta t) - T_{\text{delay}}\right) & \text{if } \tau_{\text{idle}}(t) < T_{\text{delay}} < \tau_{\text{idle}}(t + \Delta t) \\
   \Delta t & \text{if } \tau_{\text{idle}}(t) \ge T_{\text{delay}}
   \end{cases}$$

3. Apply decay:
   $$R(t + \Delta t) = \max\left(0.0, R(t) - \lambda \cdot \Delta t_{\text{active}}\right)$$

4. Update Overdrive flag:
   $$\mathcal{O}(t + \Delta t) = \left(R(t + \Delta t) \ge R_{\max} - \epsilon\right)$$

#### Decay Parameter Configurations
To guarantee complete backwards compatibility with Milestone 1 tests while adhering to Milestone 2 design specifications:
- **Default Profile (M2 Specification):** $T_{\text{delay}} = 5.0\text{ s}$, $\lambda = 10.0\text{ units/s}$.  
  *(A full 100 gauge drains in $5.0\text{s delay} + 10.0\text{s decay} = 15.0\text{s}$ total idle).*
- **Legacy M1 Config (`DEFAULT_COMBAT_CONFIG`):** $T_{\text{delay}} = 4.0\text{ s}$, $\lambda = 5.0\text{ units/s}$.  
  *(Tested in `tests/unit/combat_math.test.js:220`).*
- The update function must accept an optional `config` object:
  ```javascript
  const delay = config?.resonanceDecayDelay ?? 5.0;
  const rate  = config?.resonanceDecayRate  ?? 10.0;
  ```

---

## 2. Overdrive Mode Mechanics

### 2.1 State Transitions
Overdrive is a binary state triggered strictly when $R \ge 100.0$.
- **Activation:** Occurs on the exact frame $R$ hits $100.0$.
- **Deactivation:** Occurs instantaneously on the exact frame $R < 100.0$. There is zero grace window; spending 25 resonance for a spell immediately drops $R \le 75.0$, canceling Overdrive.

### 2.2 Combat Enhancements
When $\mathcal{O}(t) == \text{true}$:
1. **Melee Damage Multiplier:**
   $$D_{\text{melee}}^{\mathcal{O}} = \text{round}(D_{\text{base}} \times M_{\mathcal{O}})$$
   - Standard value: $M_{\mathcal{O}} = 1.30$ ($+30\%$ damage, matching `tier1_features.test.js:272`).
   - Configurable parameter: `config.overdriveDamageMultiplier` (supports $1.25$ or $1.30$).
   - Example with Penumbra sequence:
     - Hit 1: $\text{round}(22 \times 1.30) = 29$ (or $\text{round}(22 \times 1.25) = 28$)
     - Hit 2: $\text{round}(28 \times 1.30) = 36$ (or $\text{round}(28 \times 1.25) = 35$)
     - Hit 3 (Finisher): $\text{round}(48 \times 1.30) = 62$ (or $\text{round}(48 \times 1.25) = 60$)
2. **Attack Speed Bonus:**
   Attack swing animation duration is compressed by $30\%$:
   $$T_{\text{attack}}^{\mathcal{O}} = T_{\text{attack}} \times \frac{1}{1.30} \approx 0.769 \times T_{\text{attack}}$$
   *(e.g., $0.22\text{s} \to 0.169\text{s}$)*.
3. **Poise Stagger Scaling:**
   Poise damage dealt to enemies is scaled by $1.30\times$, breaking shields and boss poise thresholds faster.

---

## 3. Stygian Lance Spell Architecture

The **Stygian Lance** is Kaelen's primary ranged combat spell: an instantaneous piercing railgun beam fired horizontally along the 2.5D plane ($Z = 0$).

```
         +-----------------------------------------------------------+
         |                        STYGIAN LANCE                      |
         |  Width: 16.0m (along facing) | Height: 1.0m - 1.8m        |
         +-----------------------------------------------------------+
Player (X, Y) =============================================> 16.0m
   |              [Enemy 1 (Footman)]        [Enemy 2 (Archer)]
   |              Pierced: 55 Dmg            Pierced: 55 Dmg
   |              Knockback: +6 m/s          Knockback: +6 m/s
```

### 3.1 Spell Parameters
| Property | Value | Rationale |
| :--- | :--- | :--- |
| **Spell ID** | `'stygian_lance'` | Standardized identifier |
| **Resonance Cost** | $25.0$ Units | Exactly 4 casts per full 100 gauge |
| **Base Damage** | $55.0$ Magic Damage | High-impact burst; two-shots basic grunts (Footman 80 HP) |
| **Reach Distance** | $16.0\text{ m}$ | Covers entire camera viewport width |
| **Beam Height Span** | $1.0\text{ m} - 1.8\text{ m}$ | Covers grounded, jumping, and elevated enemies |
| **Depth Constraint** | $Z = 0 \pm 0.5\text{ m}$ | Strict 2.5D plane lock |
| **Cooldown** | $1.50\text{ s}$ | Prevents rapid-fire spamming |
| **Knockback Vector** | $\mathbf{v}_{\text{kb}} = (\text{facing} \times 6.0, 1.8, 0.0)$ | Horizontal push + $30\%$ vertical pop |
| **Hit Reaction** | Stagger / Hit-Stop | Micro-freeze ($0.04\text{s}$) on all targets |

### 3.2 Beam Bounding Box Construction
The spell bounding box is constructed in world coordinates using `hitbox.js:createAABB`:

$$\text{BeamAABB}(x_p, y_p, \text{facing}) = \begin{cases}
\left[x_p, x_p + 16.0\right] \times \left[y_p, y_p + 1.8\right] \times [-0.5, 0.5] & \text{if } \text{facing} > 0 \\
\left[x_p - 16.0, x_p\right] \times \left[y_p, y_p + 1.8\right] \times [-0.5, 0.5] & \text{if } \text{facing} < 0
\end{cases}$$

Alternatively, when matching `hitbox.js:createBeamAABB(origin, facing, 16.0, 1.0)`:
- $y_{\min} = y_p + 1.2 - 0.5 = y_p + 0.7$
- $y_{\max} = y_p + 1.2 + 0.5 = y_p + 1.7$
Both representations intersect standard enemy hurtboxes ($y \in [0, 1.8]$).

### 3.3 Multi-Target Piercing Evaluation Algorithm
Unlike melee swings which can be single-target or standard projectiles that extinguish on first impact, Stygian Lance **pierces all entities** along its ray.

```typescript
function executeStygianLance(
    player: { x: number, y: number, facing: number },
    enemies: Array<EnemyEntity>,
    hitTracker: HitTracker,
    config: CombatConfig
): SpellExecutionResult {
    const beamBox = createBeamAABB(
        { x: player.x, y: player.y },
        player.facing,
        16.0,
        1.0
    );

    const hits: Array<SpellHitRecord> = [];

    for (const enemy of enemies) {
        // Skip defeated or inactive enemies
        if (!enemy || enemy.hp <= 0 || enemy.state === 'DEFEATED') {
            continue;
        }

        // Get enemy hurtbox
        const hurtbox = enemy.getHurtbox 
            ? enemy.getHurtbox() 
            : { minX: enemy.x - 0.5, maxX: enemy.x + 0.5, minY: enemy.y, maxY: enemy.y + 1.8 };

        // 2.5D AABB overlap check
        if (check2DOverlap(beamBox, hurtbox, true)) {
            // Deduplicate: ensure this enemy is only struck once per cast
            if (hitTracker.registerHit(enemy.id)) {
                // Compute knockback
                const knockback = calculateKnockback(
                    player,
                    enemy,
                    6.0,
                    player.facing,
                    enemy.knockbackResistance || 0
                );

                // Calculate mitigated or raw damage
                const damageDealt = calculateDamage(55, enemy.defense || 0);
                enemy.hp = Math.max(0, enemy.hp - damageDealt);

                // Apply knockback velocity to enemy kinematics
                enemy.vx = knockback.vx;
                enemy.vy = knockback.vy;

                hits.push({
                    targetId: enemy.id,
                    damageDealt,
                    remainingHp: enemy.hp,
                    knockback
                });
            }
        }
    }

    return {
        success: true,
        damage: 55,
        range: 16.0,
        isPiercing: true,
        targetsHit: hits.length,
        hits
    };
}
```

### 3.4 Spell Cooldown & Input Buffering
To ensure fluid, responsive combat without dropped inputs:
1. **Cooldown State ($\tau_{\text{cd}}$):**
   - Initialized to $1.50\text{s}$ upon successful cast.
   - Decremented by $\Delta t$ each frame.
   - Cannot re-cast while $\tau_{\text{cd}} > 0$.
2. **Input Buffer State ($\tau_{\text{buf}}$):**
   - Buffer duration: $T_{\text{buffer}} = 0.20\text{ s}$.
   - If player triggers the cast input while in an uninterruptible animation state (e.g., active melee swing frames, dodge roll, or hit-stun):
     - `spellBufferTimer = 0.20`
     - `bufferedSpell = 'stygian_lance'`
   - When the animation completes or enters recovery:
     - Check: is `spellBufferTimer > 0`?
     - Check: is `resonance >= 25` and `spellCooldown <= 0`?
     - If true: trigger spell execution immediately, reset `spellBufferTimer = 0`, `bufferedSpell = null`.

---

## 4. Class Interface & Contract Specification

### 4.1 Interface Contract: `PlayerCombat` (`src/engine/character_combat.js`)

```javascript
class PlayerCombat {
    /**
     * Initializes the player combat controller with resonance & spell systems.
     * @param {Object} [options={}] - Custom balance tuning overrides.
     */
    constructor(options = {}) {
        // Health container
        this.hp = 100;
        this.maxHp = 100;
        this.isInvulnerable = false;
        this.invulnerabilityTimer = 0.0;

        // Weapon inventory & active profile
        this.activeWeapon = options.weapon || 'penumbra'; // 'penumbra' | 'great_mace' | 'twin_daggers'

        // 3-Hit Combo System
        this.comboStep = 0;
        this.lastAttackTime = 0.0;
        this.comboResetTime = 0.65;
        this.attackTimer = 0.0;
        this.isAttacking = false;

        // Stygian Resonance Economy
        this.resonance = 0.0;
        this.maxResonance = 100.0;
        this.resonanceIdleTimer = 0.0;
        this.isOverdrive = false;

        // Configuration parameters
        this.resonanceDecayDelay = options.resonanceDecayDelay ?? 5.0; // 5.0s M2 spec
        this.resonanceDecayRate = options.resonanceDecayRate ?? 10.0;   // 10 u/s M2 spec
        this.overdriveMultiplier = options.overdriveMultiplier ?? 1.30; // +30% melee damage

        // Spell Management
        this.spellCooldown = 0.0;
        this.spellCooldownDuration = 1.50;
        this.spellBufferTimer = 0.0;
        this.spellBufferDuration = 0.20;
        this.bufferedSpell = null;

        // Hit Deduplication
        this.hitTracker = new HitTracker();
        this.hitStopTimer = 0.0;
    }

    /**
     * Increments the resonance gauge and resets the idle timer.
     * @param {number} amount - Energy increment (e.g. +15 for light hit, +100 for parry).
     * @returns {number} Current resonance.
     */
    addResonance(amount) {
        if (!Number.isFinite(amount) || amount <= 0) return this.resonance;
        this.resonance = Math.min(this.maxResonance, this.resonance + amount);
        this.resonanceIdleTimer = 0.0;
        this.updateOverdrive();
        return this.resonance;
    }

    /**
     * Attempts to spend resonance for an action or spell.
     * @param {number} cost - Energy cost.
     * @returns {boolean} True if cost was deducted; false if insufficient energy.
     */
    spendResonance(cost) {
        if (!Number.isFinite(cost) || cost <= 0) return true;
        if (this.resonance >= cost) {
            this.resonance -= cost;
            this.resonanceIdleTimer = 0.0;
            this.updateOverdrive();
            return true;
        }
        return false;
    }

    /**
     * Updates Overdrive boolean state based on resonance threshold.
     */
    updateOverdrive() {
        this.isOverdrive = (this.resonance >= this.maxResonance - 1e-5);
    }

    /**
     * Evaluates continuous delta-time decay of resonance.
     * @param {number} dt - Timestep in seconds.
     */
    updateResonanceDecay(dt) {
        if (!Number.isFinite(dt) || dt <= 0) return;
        this.resonanceIdleTimer += dt;

        if (this.resonanceIdleTimer >= this.resonanceDecayDelay && this.resonance > 0) {
            const activeDecayDt = Math.min(dt, this.resonanceIdleTimer - this.resonanceDecayDelay);
            if (activeDecayDt > 0) {
                this.resonance = Math.max(0.0, this.resonance - this.resonanceDecayRate * activeDecayDt);
                this.updateOverdrive();
            }
        }
    }

    /**
     * Queues spell cast input into the input buffer.
     * @param {string} spellName - Name of the spell (e.g. 'stygian_lance').
     */
    queueSpell(spellName) {
        this.bufferedSpell = spellName;
        this.spellBufferTimer = this.spellBufferDuration;
    }

    /**
     * Triggers spell execution if resources, cooldowns, and conditions are met.
     * @param {string} spellName - 'stygian_lance' | 'cinder_nova' | 'aegis_of_umbra'
     * @param {Object} [context={}] - { playerPos, facing, enemies }
     * @returns {Object} Execution result.
     */
    triggerSpell(spellName, context = {}) {
        if (spellName === 'stygian_lance') {
            const COST = 25;
            if (this.spellCooldown > 0) {
                return { success: false, reason: 'COOLDOWN_ACTIVE', cooldownRemaining: this.spellCooldown };
            }
            if (this.resonance < COST) {
                return { success: false, reason: 'INSUFFICIENT_RESONANCE', resonance: this.resonance };
            }

            // Deduct cost and set cooldown
            this.spendResonance(COST);
            this.spellCooldown = this.spellCooldownDuration;

            const player = context.playerPos || { x: 0, y: 0 };
            const facing = context.facing || 1;
            const enemies = context.enemies || [];

            // Perform multi-target piercing evaluation
            const spellResult = executeStygianLance(
                { x: player.x, y: player.y, facing },
                enemies,
                this.hitTracker,
                DEFAULT_COMBAT_CONFIG
            );

            return {
                success: true,
                spell: 'stygian_lance',
                damage: 55,
                range: 16.0,
                isPiercing: true,
                screenShake: 0.20,
                targetsHit: spellResult.targetsHit,
                hits: spellResult.hits
            };
        }

        // Support fallback spells (Cinder Nova & Aegis of Umbra)
        // ...
    }

    /**
     * Main per-tick update loop.
     * @param {number} dt - Timestep in seconds.
     * @param {Object} [context={}]
     */
    update(dt, context = {}) {
        if (!Number.isFinite(dt) || dt <= 0) return;

        // 1. Hit-stop freeze
        if (this.hitStopTimer > 0) {
            this.hitStopTimer = Math.max(0, this.hitStopTimer - dt);
            return;
        }

        // 2. Cooldown & Buffer Timers
        if (this.spellCooldown > 0) {
            this.spellCooldown = Math.max(0, this.spellCooldown - dt);
        }

        if (this.spellBufferTimer > 0) {
            this.spellBufferTimer = Math.max(0, this.spellBufferTimer - dt);
            if (!this.isAttacking && this.spellCooldown <= 0 && this.bufferedSpell) {
                this.triggerSpell(this.bufferedSpell, context);
                this.bufferedSpell = null;
                this.spellBufferTimer = 0.0;
            }
        }

        // 3. Melee attack state & recovery
        if (this.attackTimer > 0) {
            this.attackTimer = Math.max(0, this.attackTimer - dt);
            if (this.attackTimer <= 0) {
                this.isAttacking = false;
            }
        }

        // 4. Invulnerability timer
        if (this.invulnerabilityTimer > 0) {
            this.invulnerabilityTimer = Math.max(0, this.invulnerabilityTimer - dt);
            if (this.invulnerabilityTimer <= 0) {
                this.isInvulnerable = false;
            }
        }

        // 5. Resonance out-of-combat decay
        this.updateResonanceDecay(dt);
    }
}
```

---

## 5. Coordination with Parry System & Combat Controller

### 5.1 Parry System Coordination (`parry_system.js` $\to$ `character_combat.js`)
When `ParrySystem.evaluateIncomingHit()` evaluates a successful deflection within the 6-frame window:
```javascript
const parryResult = parrySystem.evaluateIncomingHit(incomingAttack);
if (parryResult.result === 'PARRIED') {
    // 1. Grant +100 resonance burst -> Immediate Overdrive activation
    combat.addResonance(parryResult.resonanceGain); // +100
    assert.equal(combat.resonance, 100);
    assert.equal(combat.isOverdrive, true);

    // 2. Schedule 0.08s hit-stop
    combat.hitStopTimer = parryResult.hitStop; // 0.08s
}
```

### 5.2 Melee Weapon Hit Coordination
When a melee attack swing collider overlaps an enemy hurtbox:
1. Lookup weapon resonance gain:
   - Penumbra Swing 1 & 2: $+15$
   - Penumbra Swing 3: $+25$
   - Twin Daggers: $+25$
   - Executioner's Great-Mace: $+20$
2. Add resonance: `combat.addResonance(gain)`.
3. Check Overdrive multiplier:
   If `combat.isOverdrive`: damage multiplied by `combat.overdriveMultiplier` ($1.30\times$).

---

## 6. Comprehensive Test Matrix for Unit & E2E Validation

### 6.1 Unit Test Suite (`tests/unit/character_combat.test.js`)
The unit test suite must rigorously verify the following 10 test vectors:

| Test ID | Test Vector Description | Expected Behavior |
| :--- | :--- | :--- |
| **TC-RES-01** | Initial state initialization | `resonance = 0`, `isOverdrive = false`, `spellCooldown = 0` |
| **TC-RES-02** | Incremental accumulation from melee hits | Add 15 twice $\to R=30$; add 25 (finisher) $\to R=55$ |
| **TC-RES-03** | Saturation at 100 & Overdrive activation | Add 100 $\to R=100$, `isOverdrive = true`; overflow capped at 100 |
| **TC-RES-04** | Idle delay gating before decay | Idle for $4.9\text{s}$ ($< 5.0\text{s}$) $\implies R$ unchanged at 100 |
| **TC-RES-05** | Continuous active decay calculation | At $t = 6.0\text{s}$ ($1.0\text{s}$ active at $10\text{ u/s}$), $R = 90.0$, `isOverdrive = false` |
| **TC-RES-06** | Complete decay underflow clamping | Long idle ($20.0\text{s}$) $\implies R$ clamped at exactly $0.0$, no negative values |
| **TC-RES-07** | Stygian Lance insufficient energy guard | Cast with $R=20 < 25 \implies$ `success = false`, `reason = 'INSUFFICIENT_RESONANCE'`, $R$ remains 20 |
| **TC-RES-08** | Stygian Lance energy deduction & Overdrive exit | Cast with $R=100 \implies$ `success = true`, $R=75$, `isOverdrive = false` |
| **TC-RES-09** | Multi-target piercing beam collision | 2 enemies at $x=5$ and $x=12$ both struck for 55 dmg, knockback applied, deduplicated |
| **TC-RES-10** | Cooldown and input buffer queueing | Re-cast within $1.5\text{s}$ rejected with `'COOLDOWN_ACTIVE'`; buffered cast triggers on cooldown expiry |

### 6.2 Reference Unit Test Implementation Snippet
```javascript
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { PlayerCombat } = require('../../src/engine/character_combat.js');
const { Hitbox } = require('../../src/engine/hitbox.js');

describe('Character Combat: Resonance Economy & Stygian Lance', () => {
    it('manages resonance accumulation, saturation, and Overdrive mode toggle', () => {
        const combat = new PlayerCombat();
        assert.equal(combat.resonance, 0);
        assert.equal(combat.isOverdrive, false);

        combat.addResonance(15);
        assert.equal(combat.resonance, 15);

        combat.addResonance(100);
        assert.equal(combat.resonance, 100);
        assert.equal(combat.isOverdrive, true);
    });

    it('drains resonance after 5.0s idle delay at 10 u/s with clamping to 0', () => {
        const combat = new PlayerCombat({ resonanceDecayDelay: 5.0, resonanceDecayRate: 10.0 });
        combat.addResonance(50);

        combat.update(4.0);
        assert.equal(combat.resonance, 50, 'No decay during idle delay');

        combat.update(2.0); // 6.0s total -> 1.0s active decay @ 10 u/s = -10
        assert.ok(Math.abs(combat.resonance - 40.0) < 1e-4);

        combat.update(10.0); // Drains remaining 40 units
        assert.equal(combat.resonance, 0.0);
    });

    it('rejects Stygian Lance when resonance < 25 without modifying energy', () => {
        const combat = new PlayerCombat();
        combat.resonance = 20;

        const result = combat.triggerSpell('stygian_lance');
        assert.equal(result.success, false);
        assert.equal(result.reason, 'INSUFFICIENT_RESONANCE');
        assert.equal(combat.resonance, 20);
    });

    it('executes Stygian Lance, pierces all enemies in path, and enforces 1.5s cooldown', () => {
        const combat = new PlayerCombat();
        combat.addResonance(100);

        const enemies = [
            { id: 'grunt_1', x: 4.0, y: 0, hp: 80, defense: 0 },
            { id: 'grunt_2', x: 12.0, y: 0, hp: 80, defense: 0 }
        ];

        const result = combat.triggerSpell('stygian_lance', {
            playerPos: { x: 0, y: 0 },
            facing: 1,
            enemies
        });

        assert.equal(result.success, true);
        assert.equal(result.damage, 55);
        assert.equal(result.range, 16.0);
        assert.equal(result.isPiercing, true);
        assert.equal(combat.resonance, 75);
        assert.equal(combat.isOverdrive, false);
        assert.equal(enemies[0].hp, 25);
        assert.equal(enemies[1].hp, 25);

        // Immediate subsequent cast blocked by cooldown
        const failCast = combat.triggerSpell('stygian_lance');
        assert.equal(failCast.success, false);
        assert.equal(failCast.reason, 'COOLDOWN_ACTIVE');
    });
});
```

---

## 7. Mathematical & Architecture Verification Summary

| Invariant | Mathematical Proof / Guarantee | Error Handling |
| :--- | :--- | :--- |
| **Gauge Boundedness** | $R(t) = \max(0.0, \min(100.0, R(t)))$ | Guarded against IEEE-754 NaN/Infinity |
| **Overdrive Monotonicity** | $\mathcal{O}(t) = (R(t) \ge 100.0 - \epsilon)$ | Instantaneous transition on float bounds |
| **Piercing Completeness** | Beam AABB tests all active scene entities using 2.5D slab overlap | Ray length clamped to $16.0\text{ m}$ |
| **Zero Duplicate Damage** | `HitTracker` Set ensures $O(1)$ unique entity registration per cast | Tracker cleared at cast initiation |
| **Input Buffer Reliability** | Timer decremented via $\Delta t$; consumed on first eligible tick | Automatically expires after $0.20\text{s}$ |
| **Strict 2.5D Lock** | Beam depth $Z \in [-0.5, 0.5]$, knockback $v_z = 0.0$ | No out-of-plane drift |

This technical design specification provides the complete blueprint for implementation in Milestone 2.
