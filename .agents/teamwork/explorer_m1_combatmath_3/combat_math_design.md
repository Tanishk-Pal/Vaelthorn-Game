# COMBAT MATH & DAMAGE ENGINE DESIGN SPECIFICATION
**Project:** Vaelthorn: The Oath of Darkness  
**Subsystem:** `src/engine/combat_math.js`  
**Milestone:** M1 — Kinematics & Hitbox Math Engine  
**Author:** `explorer_m1_combatmath_3` (Combat Math Exploration Specialist)  
**Date:** 2026-11-01  
**Status:** COMPLETE / SPECIFICATION READY  

---

## 1. Executive Summary & Architectural Scope

This specification document establishes the rigorous mathematical foundation, numerical formulations, algorithmic rules, defensive guards, and interface contracts for the combat math engine of **Vaelthorn: The Oath of Darkness** (`src/engine/combat_math.js`).

The combat math engine is architected as a **pure, deterministic, zero-dependency mathematical library** that executes identically across:
1. Node.js unit and integration test harnesses (`tests/unit/combat_math.test.js`, `tests/e2e/*.test.js`, `tests/playtest_runner.js`).
2. The standalone 3D WebGL / HTML5 client runtime (`Vaelthorn_Playable_Prototype.html`).
3. Dedicated physics threads or Web Workers without DOM, Three.js, or browser API dependencies.

### Core Systems Governed by `combat_math.js`:
- **Combo Scaling & Weapon Damage Profiles**: Analytical damage values across Kaelen's 3-hit combo string ($22 \to 28 \to 48$), Stygian Lance spell ($55$), Heavy Cleave ($70$), and enemy attacks.
- **Critical Riposte Multiplier**: $2.5\times$ damage multiplier against targets in `STAGGER` or poise-broken state.
- **Defense Mitigation & Effective HP**: Hyperbolic armor mitigation formula $D_{\text{taken}} = \max\left(1, \text{round}\left(\frac{D_{\text{raw}}}{1 + \frac{\text{defense}}{100}}\right)\right)$ with non-negative damage guarantees, singularity guards, and armor-shred handling.
- **Poise Damage, Stagger Thresholds & Recovery Dynamics**: Poise depletion $\text{currentPoise} = \max(0, \text{currentPoise} - \text{poiseDamage})$, stagger duration ($1.2\text{ s}$), delayed out-of-combat poise regeneration ($20.0\text{ u/s}$ after $3.0\text{ s}$ delay), and full recovery on stagger reset.
- **Stygian Resonance Economy**: Bounds $[0, 100]$, accumulation ($+15$ light hit, $+100$ perfect parry), idle timer threshold ($4.0\text{ s}$), linear decay ($-5.0\text{ u/s}$), spell cost validation ($25$ for Stygian Lance), and Overdrive mode ($+30\%$ attack speed and $+30\%$ stagger power).
- **Parabolic Projectile Trajectory Mechanics**: Closed-form ballistics for Cinder-Bough Archer flaming stakes and Boss Vael-Krag leap slams, including analytical time-of-flight to arbitrary elevation, apex determination, target interception velocity solving, dual-angle ballistic solutions (low vs high arc), and arc sampling for raycasts.

---

## 2. Mathematical Formulations & Exact Equations

### 2.1 Attack Damage Profiles & Combo Sequences

The protagonist Kaelen (The Eclipse-Bound) wields the *Ashen Longsword ("Penumbra")* with a fluid 3-hit attack chain:

$$\text{Combo Hit Damage } D_{\text{combo}}(k) = \begin{cases}
22 & \text{for } k = 1 \quad (\text{Horizontal Slash 1}) \\
28 & \text{for } k = 2 \quad (\text{Horizontal Slash 2}) \\
48 & \text{for } k = 3 \quad (\text{Overhead Cleave Finisher})
\end{cases}$$

#### Additional Attack Damages:
- **Heavy Cleave / Executioner's Great-Mace**: $D_{\text{heavy}} = 70$ (shield-shattering, high stagger).
- **Twin Eclipse Daggers**: $D_{\text{dagger}} = 18$ (blistering speed, rapid resonance).
- **Stygian Lance Spell**: $D_{\text{lance}} = 55$ (starlight railgun piercing line).
- **Ashen Footman Basic Slash**: $D_{\text{footman}} = 18$.
- **Cinder-Bough Archer Flaming Stake**: $D_{\text{archer}} = 25$.
- **Boss Vael-Krag Bell Sweep**: $D_{\text{sweep}} = 35$.
- **Boss Vael-Krag Seismic Slam**: $D_{\text{slam}} = 45$.

---

### 2.2 Critical Riposte Multiplier

When an enemy entity's poise is completely depleted ($\text{currentPoise} \le 0$) or when deflected by a Perfect Parry, the entity enters the vulnerable `STAGGER` state for $T_{\text{stagger}} = 1.2\text{ s}$.

Any attack connecting with an entity in `STAGGER` triggers a Critical Riposte:

$$M_{\text{riposte}} = 2.50$$
$$D_{\text{crit}} = D_{\text{raw}} \cdot M_{\text{riposte}} = 2.5 \cdot D_{\text{raw}}$$

#### Riposte Damage Outcomes:
- Hit 1 Riposte: $22 \times 2.5 = 55$
- Hit 2 Riposte: $28 \times 2.5 = 70$
- Hit 3 Finisher Riposte: $48 \times 2.5 = 120$
- Heavy Cleave Riposte: $70 \times 2.5 = 175$

---

### 2.3 Damage Mitigation & Effective Health (EHP)

#### Mitigation Formula:
Armor/Defense provides smooth diminishing returns such that each point of defense adds $1\%$ of the target's base HP to its Effective Health Pool (EHP).

For $D_{\text{raw}} > 0$:
$$D_{\text{taken}} = \max\left(1, \text{round}\left(\frac{D_{\text{raw}}}{1 + \frac{\text{defense}}{100}}\right)\right)$$

For $D_{\text{raw}} \le 0$:
$$D_{\text{taken}} = 0$$

#### Analytical Properties & Proof of EHP Linearity:
Let $H$ be the entity's current HP. The number of raw hits of damage $D$ required to defeat the entity is:
$$N = \frac{H}{D_{\text{taken}}} = \frac{H}{\frac{D}{1 + \frac{\text{defense}}{100}}} = \frac{H \cdot \left(1 + \frac{\text{defense}}{100}\right)}{D}$$

The Effective Health Pool is:
$$\text{EHP} = H \cdot \left(1 + \frac{\text{defense}}{100}\right)$$
- At $\text{defense} = 0$: $\text{EHP} = 1.00 \cdot H$ ($0\%$ damage reduction).
- At $\text{defense} = 50$: $\text{EHP} = 1.50 \cdot H$ ($33.3\%$ damage reduction; $D_{\text{taken}} = D / 1.5$).
- At $\text{defense} = 100$: $\text{EHP} = 2.00 \cdot H$ ($50.0\%$ damage reduction; $D_{\text{taken}} = D / 2.0$).
- At $\text{defense} = 200$: $\text{EHP} = 3.00 \cdot H$ ($66.7\%$ damage reduction; $D_{\text{taken}} = D / 3.0$).
- At $\text{defense} = 300$: $\text{EHP} = 4.00 \cdot H$ ($75.0\%$ damage reduction; $D_{\text{taken}} = D / 4.0$).

#### Edge-Case & Armor Shred Handling:
1. **Minimum Chip Damage**: $\max(1, \dots)$ guarantees that any successful offensive attack ($D_{\text{raw}} \ge 1$) deals at least $1$ point of chip damage, preventing unkillable high-defense locks.
2. **Negative Defense (Vulnerability / Armor Shred)**: If debuffs or status effects reduce defense below 0, damage is amplified. However, as $\text{defense} \to -100$, $1 + \text{defense}/100 \to 0$ which induces a divide-by-zero singularity.
   To preserve numeric stability, defense is strictly clamped from below:
   $$\text{defense}_{\text{effective}} = \max(-90.0, \text{defense})$$
   At $\text{defense} = -90$, damage is multiplied by $\frac{1}{1 - 0.90} = 10.0\times$ (maximum $1000\%$ vulnerability cap).

---

### 2.4 Poise System, Threshold Breaking & Recovery Dynamics

Poise represents an entity's physical equilibrium and resistance to interruption/stagger.

#### Entity Poise Baseline Profiles:
| Entity Archetype | Max Poise ($P_{\max}$) | Regen Rate ($R_{\text{poise}}$) | Regen Delay ($T_{\text{delay}}$) | Stagger Duration ($T_{\text{stagger}}$) |
|---|---|---|---|---|
| **Player (Kaelen)** | $100$ | $20.0\text{ u/s}$ | $3.0\text{ s}$ | $1.0\text{ s}$ |
| **The Ashen Footman** | $40$ | $15.0\text{ u/s}$ | $2.5\text{ s}$ | $1.2\text{ s}$ |
| **Cinder-Bough Archer** | $25$ | $10.0\text{ u/s}$ | $2.0\text{ s}$ | $1.2\text{ s}$ |
| **The Iron Phalanx** | $120$ | $30.0\text{ u/s}$ | $3.0\text{ s}$ | $1.5\text{ s}$ |
| **Boss Vael-Krag** | $250$ | $25.0\text{ u/s}$ | $4.0\text{ s}$ | $1.5\text{ s}$ |

#### Attack Poise Damage Profile:
| Attack | Poise Damage ($\Delta P$) | Footman Hits to Stagger ($P_{\max}=40$) |
|---|---|---|
| Combo Hit 1 | $15$ | 3 hits ($15 + 15 + 15 = 45 > 40$) |
| Combo Hit 2 | $20$ | 2 hits ($15 + 20 = 35 < 40$; 2nd combo breaks) |
| Combo Hit 3 (Finisher) | $40$ | 1 hit ($40 \ge 40$) |
| Heavy Cleave / Mace | $80$ | 1 hit ($80 \ge 40$) |
| Perfect Parry Deflection | $100$ | 1 parry (instantly breaks footman & archer) |
| Stygian Lance | $35$ | 2 hits |

#### Poise Reduction Formula:
When struck by an attack dealing poise damage $\Delta P$:
$$P_{\text{new}} = \max(0, P_{\text{current}} - \Delta P)$$
$$t_{\text{idlePoise}} \leftarrow 0.0$$

#### Stagger State Trigger & Lifecycle:
$$\text{If } P_{\text{new}} \le 0 \implies \begin{cases}
\text{isStaggered} \leftarrow \text{true} \\
\text{staggerTimer} \leftarrow T_{\text{stagger}} = 1.2\text{ s} \\
P_{\text{new}} \leftarrow 0
\end{cases}$$

While $\text{isStaggered} == \text{true}$:
- The entity cannot initiate movement or attacks.
- Incoming damage receives the $2.5\times$ Critical Riposte multiplier.
- Poise regeneration is disabled.
- Stagger timer ticks down: $\text{staggerTimer}(t + \Delta t) = \max(0, \text{staggerTimer}(t) - \Delta t)$.

#### Stagger Recovery:
When $\text{staggerTimer} \le 0$:
$$\text{isStaggered} \leftarrow \text{false}$$
$$P_{\text{new}} \leftarrow P_{\max} \quad (\text{Poise completely restored upon recovery})$$

#### Out-of-Combat Poise Regeneration:
When entity is NOT staggered ($\neg \text{isStaggered}$), and has not received poise damage for $t_{\text{idlePoise}} \ge T_{\text{delay}}$:
$$P(t + \Delta t) = \min\left(P_{\max}, P(t) + R_{\text{poise}} \cdot \Delta t\right)$$

---

### 2.5 Stygian Resonance Gauge & Resource Economy

Stygian Resonance ($R$) is Kaelen's primary magical/momentum energy resource ($R \in [0, 100]$).

#### Accumulation Dynamics:
- **Light Melee Hit Connected**: $\Delta R = +15$
- **Combo Finisher Connected**: $\Delta R = +25$
- **Perfect Parry Deflection**: $\Delta R = +100$ (Full burst reward)
- **General Gain Formula**:
  $$R_{\text{new}} = \min(100.0, \max(0.0, R_{\text{current}} + \Delta R))$$
  $$t_{\text{idleResonance}} \leftarrow 0.0$$

#### Out-of-Combat Decay:
When the player does not strike an enemy or perform a parry for $t_{\text{idleResonance}} \ge T_{\text{decayDelay}} = 4.0\text{ s}$, resonance drains linearly at rate $R_{\text{decay}} = 5.0\text{ units/s}$:
$$R(t + \Delta t) = \max\left(0.0, R(t) - R_{\text{decay}} \cdot \Delta t\right)$$

#### Spell Expenditure:
- **Stygian Lance**: Costs $25$ Resonance.
  $$\text{canCast} = R \ge 25.0$$
  $$R_{\text{postCast}} = R - 25.0$$
- **Cinder Nova**: Costs $35$ Resonance.
- **Aegis of Umbra**: Costs $50$ Resonance.

#### Overdrive Mode:
When resonance is sustained at maximum capacity ($R = 100.0$):
$$\text{isOverdrive} = (R \ge 100.0)$$
- **Attack Speed Buff**: $+30\%$ speed (attack animation / duration scaled by $1.30$, reducing swing time from $0.22\text{ s}$ to $0.22 / 1.3 \approx 0.169\text{ s}$).
- **Stagger Power Buff**: $+30\%$ poise damage applied to enemy targets ($\Delta P_{\text{effective}} = \Delta P \times 1.30$).
- Overdrive immediately deactivates if resonance drops below $100.0$ (e.g. by casting a spell or after out-of-combat decay begins).

---

### 2.6 Parabolic Projectile Trajectory Mechanics

Used by the **Cinder-Bough Archer** flaming stakes, **Boss Vael-Krag** leaping slams, and lobbed projectiles along the 2.5D plane ($Z = 0$).

Let:
- $\vec{r}_0 = (x_0, y_0, 0)$ be the launch origin.
- $\vec{v}_0 = (v_{x0}, v_{y0}, 0)$ be the initial launch velocity vector.
- $g$ be the downward gravitational acceleration ($g = -26.0\text{ m/s}^2$). Let $\bar{g} = |g| = 26.0\text{ m/s}^2$.

#### 1. Instantaneous Kinematic Equations ($t \ge 0$):
$$x(t) = x_0 + v_{x0} \cdot t$$
$$y(t) = y_0 + v_{y0} \cdot t - \frac{1}{2} \bar{g} \cdot t^2$$
$$z(t) \equiv 0.0$$

Velocity vector at time $t$:
$$v_x(t) = v_{x0}$$
$$v_y(t) = v_{y0} - \bar{g} \cdot t$$
$$v_z(t) \equiv 0.0$$

#### 2. Projectile Flight Tangent Angle (Pitch Orientation):
To rotate projectile 2D/3D meshes (arrows, stakes) tangentially along their velocity arc:
$$\theta(t) = \text{atan2}(v_y(t), v_x(t))$$

#### 3. Trajectory Apex (Peak of the Arc):
Vertical velocity reaches zero at the apex ($v_y(t_{\text{apex}}) = 0$):
$$v_{y0} - \bar{g} \cdot t_{\text{apex}} = 0 \implies t_{\text{apex}} = \frac{v_{y0}}{\bar{g}} \quad (\text{for } v_{y0} > 0)$$
Apex elevation:
$$y_{\text{apex}} = y_0 + \frac{v_{y0}^2}{2 \bar{g}}$$
Apex horizontal position:
$$x_{\text{apex}} = x_0 + v_{x0} \cdot t_{\text{apex}} = x_0 + \frac{v_{x0} v_{y0}}{\bar{g}}$$

#### 4. Time-of-Flight to Target Elevation $y_{\text{target}}$:
Solving $y(t) = y_{\text{target}}$:
$$y_0 + v_{y0} t - \frac{1}{2} \bar{g} t^2 = y_{\text{target}} \implies \frac{1}{2} \bar{g} t^2 - v_{y0} t + (y_{\text{target}} - y_0) = 0$$
Quadratic discriminant:
$$\Delta_{\text{flight}} = v_{y0}^2 - 2 \bar{g} (y_{\text{target}} - y_0) = v_{y0}^2 + 2 \bar{g} (y_0 - y_{\text{target}})$$

- If $\Delta_{\text{flight}} < 0$, the projectile apex is lower than $y_{\text{target}}$ (target elevation is unreachable).
- If $\Delta_{\text{flight}} \ge 0$, the forward physical impact time is:
  $$t_{\text{impact}} = \frac{v_{y0} + \sqrt{\Delta_{\text{flight}}}}{\bar{g}}$$

#### 5. Ballistic Targeting Solver — Mode A: Fixed Time of Flight $T$:
Given launch position $(x_0, y_0)$, target position $(x_t, y_t)$, and desired time of flight $T > 0$:
$$v_{x0} = \frac{x_t - x_0}{T}$$
$$v_{y0} = \frac{y_t - y_0 + \frac{1}{2} \bar{g} T^2}{T}$$
This closed-form formula provides singular-free, 100% deterministic target interception without iteration or trigonometry.

#### 6. Ballistic Targeting Solver — Mode B: Fixed Launch Speed $v_0$:
Given launch speed $v_0$, origin $(x_0, y_0)$, and target $(x_t, y_t)$ with $\Delta x = x_t - x_0$, $\Delta y = y_t - y_0$:
The required launch angle $\theta$ satisfies the classical trajectory equation:
$$\tan \theta = \frac{v_0^2 \pm \sqrt{v_0^4 - \bar{g} (\bar{g} \Delta x^2 + 2 \Delta y v_0^2)}}{\bar{g} |\Delta x|}$$
Ballistic Discriminant:
$$D_{\text{ballistic}} = v_0^4 - \bar{g} \cdot \left(\bar{g} \cdot \Delta x^2 + 2 \cdot \Delta y \cdot v_0^2\right)$$

- If $D_{\text{ballistic}} < 0$, the target is out of range at speed $v_0$.
- If $D_{\text{ballistic}} \ge 0$:
  - **Low Arc (direct/flat)**: $\theta_{\text{low}} = \text{atan}\left(\frac{v_0^2 - \sqrt{D_{\text{ballistic}}}}{\bar{g} |\Delta x|}\right)$
  - **High Arc (lobbed over obstacles)**: $\theta_{\text{high}} = \text{atan}\left(\frac{v_0^2 + \sqrt{D_{\text{ballistic}}}}{\bar{g} |\Delta x|}\right)$
  - Velocity components:
    $$v_{x0} = \text{sign}(\Delta x) \cdot v_0 \cos \theta, \quad v_{y0} = v_0 \sin \theta$$

#### 7. Discrete Arc Sampling:
For predictive trajectory lines and continuous swept collision raycasts:
$$S = \left\{ \vec{r}\left(k \cdot \frac{t_{\text{max}}}{N}\right) \;\middle|\; k = 0, 1, \dots, N \right\}$$
Yields $N+1$ discrete 2.5D coordinates $(x_k, y_k, 0)$.

---

## 3. Data Types, Constants & Interface Contracts

### 3.1 JSDoc TypeScript Definitions

```javascript
/**
 * @typedef {Object} CombatConfig
 * @property {number} baseDefense - Default defense value (0).
 * @property {number} defenseSoftCap - Soft cap constant for armor mitigation (100).
 * @property {number} minDefense - Minimum allowed defense floor (-90).
 * @property {number} riposteMultiplier - Critical multiplier against staggered targets (2.5).
 * @property {number} baseResonance - Initial resonance (0).
 * @property {number} maxResonance - Maximum resonance gauge capacity (100).
 * @property {number} resonanceLightHit - Resonance gained per light hit (15).
 * @property {number} resonanceFinisherHit - Resonance gained on combo finisher (25).
 * @property {number} resonanceParry - Resonance gained on perfect parry (100).
 * @property {number} resonanceDecayDelay - Idle time before resonance begins decaying (4.0 s).
 * @property {number} resonanceDecayRate - Resonance decay rate per second (5.0 u/s).
 * @property {number} stygianLanceCost - Resonance cost to cast Stygian Lance (25).
 * @property {number} defaultGravity - Default gravity for ballistic calculations (-26.0 m/s^2).
 * @property {number} standardStaggerDuration - Duration of stagger state in seconds (1.2 s).
 * @property {number} parryStaggerDuration - Stagger duration triggered by parry (1.5 s).
 * @property {number} poiseRegenDelay - Idle time before poise begins recovering (3.0 s).
 * @property {number} defaultPoiseRegenRate - Default poise recovery rate per second (20.0 u/s).
 */

/**
 * @typedef {Object} PoiseState
 * @property {number} currentPoise - Current poise health.
 * @property {number} maxPoise - Maximum poise capacity.
 * @property {number} regenRate - Poise recovery units per second.
 * @property {number} regenDelay - Idle seconds before poise starts regenerating.
 * @property {number} timeSincePoiseDamage - Seconds elapsed since last poise damage taken.
 * @property {boolean} isStaggered - True if poise is broken and entity is in stagger state.
 * @property {number} staggerTimer - Remaining stagger duration in seconds.
 */

/**
 * @typedef {Object} ResonanceState
 * @property {number} current - Current Stygian Resonance [0, 100].
 * @property {number} max - Maximum Stygian Resonance capacity (100).
 * @property {number} idleTimer - Seconds elapsed since last combat engagement.
 * @property {boolean} isOverdrive - True if resonance is sustained at 100.
 */

/**
 * @typedef {Object} DamagePackage
 * @property {number} rawDamage - Unmitigated base damage of the attack.
 * @property {number} [poiseDamage=0] - Poise damage dealt to target.
 * @property {boolean} [isHeavy=false] - True if attack has shield-shattering hyper-armor.
 * @property {boolean} [isParried=false] - True if target successfully parried the attack.
 * @property {boolean} [isBlocked=false] - True if target blocked attack with shield.
 * @property {string} [attackSource='player'] - Identifier of attacking entity.
 */

/**
 * @typedef {Object} DamageResult
 * @property {number} damageDealt - Net damage subtracted from target HP.
 * @property {number} rawDamage - Input raw damage before mitigation.
 * @property {boolean} isCritical - True if critical riposte multiplier was applied.
 * @property {boolean} isParried - True if attack was deflected with zero damage.
 * @property {boolean} isBlocked - True if attack was absorbed by shield.
 * @property {boolean} isInvulnerable - True if hit was negated by I-frames.
 * @property {number} newHp - Target HP after damage application.
 * @property {boolean} isDead - True if target HP dropped to 0.
 * @property {boolean} poiseBroken - True if this attack broke the target's poise.
 */

/**
 * @typedef {Object} TrajectoryVector
 * @property {number} vx - Horizontal velocity in m/s.
 * @property {number} vy - Vertical velocity in m/s.
 * @property {number} vz - Depth velocity (strictly 0 in 2.5D).
 * @property {number} timeOfFlight - Time to impact in seconds.
 * @property {number} [launchAngle] - Launch angle in radians.
 */
```

### 3.2 Exported Configuration Constants

```javascript
export const DEFAULT_COMBAT_CONFIG = Object.freeze({
    // Combo Damages
    comboDamages: Object.freeze([22, 28, 48]),
    heavyCleaveDamage: 70,
    stygianLanceDamage: 55,
    twinDaggersDamage: 18,
    
    // Multipliers & Mitigation
    riposteMultiplier: 2.5,
    defenseSoftCap: 100,
    minDefense: -90,
    
    // Poise Tuning
    standardStaggerDuration: 1.2,
    parryStaggerDuration: 1.5,
    poiseRegenDelay: 3.0,
    defaultPoiseRegenRate: 20.0,
    defaultPlayerPoise: 100,
    defaultFootmanPoise: 40,
    defaultArcherPoise: 25,
    defaultBossPoise: 250,
    
    // Resonance Tuning
    maxResonance: 100,
    resonanceLightHit: 15,
    resonanceFinisherHit: 25,
    resonanceParry: 100,
    resonanceDecayDelay: 4.0,
    resonanceDecayRate: 5.0,
    stygianLanceCost: 25,
    
    // Ballistics
    defaultGravity: -26.0
});
```

---

## 4. Implementation Code Proposal (`src/engine/combat_math.js`)

Below is the complete, self-contained, production-grade source code recommended for `src/engine/combat_math.js`. It includes dual module exports (ESM `export` and CommonJS `module.exports`) to guarantee seamless execution across Node.js test suites and browser environments.

```javascript
/**
 * Vaelthorn: The Oath of Darkness — Combat Math Engine
 * File: src/engine/combat_math.js
 * 
 * Pure mathematical combat engine governing damage calculation, combo scaling,
 * defense mitigation, poise damage & stagger thresholds, Stygian Resonance accumulation
 * and decay, and parabolic projectile trajectory ballistics.
 */

/**
 * Default combat and balance tuning parameters.
 */
export const DEFAULT_COMBAT_CONFIG = Object.freeze({
    comboDamages: Object.freeze([22, 28, 48]),
    heavyCleaveDamage: 70,
    stygianLanceDamage: 55,
    twinDaggersDamage: 18,
    riposteMultiplier: 2.5,
    defenseSoftCap: 100,
    minDefense: -90,
    standardStaggerDuration: 1.2,
    parryStaggerDuration: 1.5,
    poiseRegenDelay: 3.0,
    defaultPoiseRegenRate: 20.0,
    defaultPlayerPoise: 100,
    defaultFootmanPoise: 40,
    defaultArcherPoise: 25,
    defaultBossPoise: 250,
    maxResonance: 100,
    resonanceLightHit: 15,
    resonanceFinisherHit: 25,
    resonanceParry: 100,
    resonanceDecayDelay: 4.0,
    resonanceDecayRate: 5.0,
    stygianLanceCost: 25,
    defaultGravity: -26.0
});

// ============================================================================
// 1. DAMAGE & MITIGATION FORMULAS
// ============================================================================

/**
 * Returns the unmitigated base damage for a given light combo step (1, 2, or 3).
 * @param {number} step - Combo index (1, 2, or 3).
 * @param {readonly number[]} [damages] - Custom damage array.
 * @returns {number} Raw damage value.
 */
export function getComboDamage(step, damages = DEFAULT_COMBAT_CONFIG.comboDamages) {
    if (!Number.isFinite(step) || step <= 1) return damages[0] || 22;
    if (step === 2) return damages[1] || 28;
    return damages[2] || 48;
}

/**
 * Calculates net damage taken after applying defense mitigation:
 * D_taken = max(1, round(D_raw / (1 + defense / 100))) for D_raw > 0.
 * If D_raw <= 0, returns 0.
 * 
 * @param {number} rawDamage - Unmitigated incoming damage.
 * @param {number} defense - Target's defense rating (>= -90).
 * @param {CombatConfig} [config] - Tuning configuration.
 * @returns {number} Net damage taken (integer >= 1 for positive rawDamage).
 */
export function calculateDamageMitigation(rawDamage, defense = 0, config = DEFAULT_COMBAT_CONFIG) {
    if (!Number.isFinite(rawDamage) || rawDamage <= 0) {
        return 0;
    }

    const safeDefense = Number.isFinite(defense) ? defense : 0;
    const minDef = Number.isFinite(config.minDefense) ? config.minDefense : DEFAULT_COMBAT_CONFIG.minDefense;
    const clampedDefense = Math.max(minDef, safeDefense);
    const softCap = Number.isFinite(config.defenseSoftCap) ? config.defenseSoftCap : DEFAULT_COMBAT_CONFIG.defenseSoftCap;

    const denominator = 1.0 + (clampedDefense / softCap);
    // Denominator is guaranteed >= 0.1 due to minDefense clamp (-90 -> 1 - 0.90 = 0.1)
    const mitigated = Math.round(rawDamage / denominator);
    return Math.max(1, mitigated);
}

/**
 * Calculates attack damage factoring in target stagger state (Critical Riposte).
 * @param {number} baseDamage - Base weapon damage.
 * @param {boolean} isTargetStaggered - True if target poise is broken.
 * @param {number} [multiplier=2.5] - Critical riposte multiplier.
 * @returns {{ damage: number, isCritical: boolean }}
 */
export function calculateRiposteDamage(baseDamage, isTargetStaggered, multiplier = DEFAULT_COMBAT_CONFIG.riposteMultiplier) {
    if (!Number.isFinite(baseDamage) || baseDamage <= 0) {
        return { damage: 0, isCritical: false };
    }
    if (isTargetStaggered) {
        const mult = Number.isFinite(multiplier) && multiplier > 0 ? multiplier : DEFAULT_COMBAT_CONFIG.riposteMultiplier;
        return {
            damage: Math.round(baseDamage * mult),
            isCritical: true
        };
    }
    return {
        damage: Math.round(baseDamage),
        isCritical: false
    };
}

/**
 * Master damage application function evaluating parry, invulnerability, shields,
 * riposte criticals, mitigation, and poise damage.
 * 
 * @param {Object} target - Target entity with hp, maxHp, defense, invulnerableTimer, poiseState.
 * @param {DamagePackage} damagePackage - Incoming attack parameters.
 * @param {CombatConfig} [config] - Balance configuration.
 * @returns {DamageResult}
 */
export function applyDamage(target, damagePackage, config = DEFAULT_COMBAT_CONFIG) {
    if (!target) {
        return {
            damageDealt: 0,
            rawDamage: 0,
            isCritical: false,
            isParried: false,
            isBlocked: false,
            isInvulnerable: false,
            newHp: 0,
            isDead: true,
            poiseBroken: false
        };
    }

    // 1. Check if already dead
    if (target.hp <= 0) {
        return {
            damageDealt: 0,
            rawDamage: damagePackage?.rawDamage || 0,
            isCritical: false,
            isParried: false,
            isBlocked: false,
            isInvulnerable: false,
            newHp: 0,
            isDead: true,
            poiseBroken: false
        };
    }

    // 2. Check Invulnerability (I-frames or active roll)
    if (target.invulnerableTimer > 0 || target.isInvulnerable || target.isRolling) {
        return {
            damageDealt: 0,
            rawDamage: damagePackage?.rawDamage || 0,
            isCritical: false,
            isParried: false,
            isBlocked: false,
            isInvulnerable: true,
            newHp: target.hp,
            isDead: false,
            poiseBroken: false
        };
    }

    // 3. Check Perfect Parry deflection
    if (damagePackage?.isParried) {
        return {
            damageDealt: 0,
            rawDamage: damagePackage?.rawDamage || 0,
            isCritical: false,
            isParried: true,
            isBlocked: false,
            isInvulnerable: false,
            newHp: target.hp,
            isDead: false,
            poiseBroken: false
        };
    }

    // 4. Check Frontal Shield Block (Light melee on Iron Phalanx)
    if (damagePackage?.isBlocked && !damagePackage?.isHeavy) {
        return {
            damageDealt: 0,
            rawDamage: damagePackage?.rawDamage || 0,
            isCritical: false,
            isParried: false,
            isBlocked: true,
            isInvulnerable: false,
            newHp: target.hp,
            isDead: false,
            poiseBroken: false
        };
    }

    // 5. Evaluate Stagger & Riposte Multiplier
    const isStaggered = Boolean(target.poiseState?.isStaggered);
    const rawDmg = Number.isFinite(damagePackage?.rawDamage) ? damagePackage.rawDamage : 0;
    const { damage: amplifiedDamage, isCritical } = calculateRiposteDamage(rawDmg, isStaggered, config.riposteMultiplier);

    // 6. Mitigate against Target Defense
    const targetDefense = Number.isFinite(target.defense) ? target.defense : 0;
    const finalDamage = calculateDamageMitigation(amplifiedDamage, targetDefense, config);

    // 7. Deduct Health & Clamp to 0
    target.hp = Math.max(0, target.hp - finalDamage);

    // 8. Grant brief post-damage I-frame grace window (0.3s)
    target.invulnerableTimer = 0.3;

    // 9. Apply Poise Damage
    let poiseBroken = false;
    if (target.poiseState && Number.isFinite(damagePackage?.poiseDamage) && damagePackage.poiseDamage > 0) {
        const poiseRes = applyPoiseDamage(target.poiseState, damagePackage.poiseDamage, config);
        poiseBroken = poiseRes.poiseBroken;
    }

    return {
        damageDealt: finalDamage,
        rawDamage: rawDmg,
        isCritical,
        isParried: false,
        isBlocked: false,
        isInvulnerable: false,
        newHp: target.hp,
        isDead: target.hp <= 0,
        poiseBroken
    };
}

// ============================================================================
// 2. POISE & STAGGER SYSTEM
// ============================================================================

/**
 * Creates an initialized PoiseState container.
 * @param {number} [maxPoise=100] - Maximum poise capacity.
 * @param {number} [regenRate=20] - Poise regeneration rate per second.
 * @param {number} [regenDelay=3.0] - Delay before poise regeneration starts.
 * @returns {PoiseState}
 */
export function createPoiseState(maxPoise = DEFAULT_COMBAT_CONFIG.defaultPlayerPoise, regenRate = DEFAULT_COMBAT_CONFIG.defaultPoiseRegenRate, regenDelay = DEFAULT_COMBAT_CONFIG.poiseRegenDelay) {
    const safeMax = Math.max(1, Number.isFinite(maxPoise) ? maxPoise : DEFAULT_COMBAT_CONFIG.defaultPlayerPoise);
    return {
        currentPoise: safeMax,
        maxPoise: safeMax,
        regenRate: Math.max(0, Number.isFinite(regenRate) ? regenRate : DEFAULT_COMBAT_CONFIG.defaultPoiseRegenRate),
        regenDelay: Math.max(0, Number.isFinite(regenDelay) ? regenDelay : DEFAULT_COMBAT_CONFIG.poiseRegenDelay),
        timeSincePoiseDamage: 0.0,
        isStaggered: false,
        staggerTimer: 0.0
    };
}

/**
 * Applies poise damage to an entity's poise state.
 * If poise drops to 0 or below, triggers the STAGGER state.
 * 
 * @param {PoiseState} poiseState - Mutable poise state container.
 * @param {number} poiseDamage - Amount of poise damage to inflict.
 * @param {CombatConfig} [config] - Tuning configuration.
 * @returns {{ currentPoise: number, isStaggered: boolean, poiseBroken: boolean }}
 */
export function applyPoiseDamage(poiseState, poiseDamage, config = DEFAULT_COMBAT_CONFIG) {
    if (!poiseState) return { currentPoise: 0, isStaggered: false, poiseBroken: false };

    const dmg = Number.isFinite(poiseDamage) ? Math.max(0, poiseDamage) : 0;
    poiseState.timeSincePoiseDamage = 0.0;

    // If already staggered, stay staggered; don't re-trigger initial break
    if (poiseState.isStaggered) {
        return {
            currentPoise: 0,
            isStaggered: true,
            poiseBroken: false
        };
    }

    poiseState.currentPoise = Math.max(0, poiseState.currentPoise - dmg);

    let poiseBroken = false;
    if (poiseState.currentPoise <= 0) {
        poiseState.isStaggered = true;
        const staggerDur = Number.isFinite(config.standardStaggerDuration) 
            ? config.standardStaggerDuration 
            : DEFAULT_COMBAT_CONFIG.standardStaggerDuration;
        poiseState.staggerTimer = staggerDur;
        poiseState.currentPoise = 0;
        poiseBroken = true;
    }

    return {
        currentPoise: poiseState.currentPoise,
        isStaggered: poiseState.isStaggered,
        poiseBroken
    };
}

/**
 * Updates poise state over delta time: handles stagger countdown, recovery, and poise regen.
 * 
 * @param {PoiseState} poiseState - Mutable poise state.
 * @param {number} dt - Timestep in seconds.
 * @returns {PoiseState} Updated poise state.
 */
export function updatePoise(poiseState, dt) {
    if (!poiseState || !Number.isFinite(dt) || dt <= 0) return poiseState;

    if (poiseState.isStaggered) {
        poiseState.staggerTimer -= dt;
        if (poiseState.staggerTimer <= 0) {
            // Recover from stagger: restore full poise
            poiseState.isStaggered = false;
            poiseState.staggerTimer = 0.0;
            poiseState.currentPoise = poiseState.maxPoise;
            poiseState.timeSincePoiseDamage = 0.0;
        }
    } else {
        poiseState.timeSincePoiseDamage += dt;
        if (poiseState.timeSincePoiseDamage >= poiseState.regenDelay) {
            poiseState.currentPoise = Math.min(
                poiseState.maxPoise,
                poiseState.currentPoise + poiseState.regenRate * dt
            );
        }
    }

    return poiseState;
}

// ============================================================================
// 3. STYGIAN RESONANCE SYSTEM
// ============================================================================

/**
 * Creates an initialized ResonanceState container.
 * @param {number} [initial=0] - Initial resonance value.
 * @param {number} [max=100] - Maximum capacity.
 * @returns {ResonanceState}
 */
export function createResonanceState(initial = 0, max = DEFAULT_COMBAT_CONFIG.maxResonance) {
    const safeMax = Math.max(1, Number.isFinite(max) ? max : DEFAULT_COMBAT_CONFIG.maxResonance);
    const safeCur = Math.max(0, Math.min(safeMax, Number.isFinite(initial) ? initial : 0));
    return {
        current: safeCur,
        max: safeMax,
        idleTimer: 0.0,
        isOverdrive: safeCur >= safeMax
    };
}

/**
 * Adds resonance to the gauge, capping at maxResonance, and resets the idle timer.
 * @param {ResonanceState} resonanceState - Mutable resonance state.
 * @param {number} amount - Amount to add (+15 for hit, +100 for parry).
 * @param {CombatConfig} [config] - Balance configuration.
 * @returns {number} New resonance value.
 */
export function addResonance(resonanceState, amount, config = DEFAULT_COMBAT_CONFIG) {
    if (!resonanceState) return 0;
    const gain = Number.isFinite(amount) ? Math.max(0, amount) : 0;
    const max = Number.isFinite(resonanceState.max) ? resonanceState.max : config.maxResonance;

    resonanceState.current = Math.min(max, resonanceState.current + gain);
    resonanceState.idleTimer = 0.0;
    resonanceState.isOverdrive = (resonanceState.current >= max);
    return resonanceState.current;
}

/**
 * Spends resonance to cast a spell if sufficient energy is available.
 * @param {ResonanceState} resonanceState - Mutable resonance state.
 * @param {number} cost - Energy cost (e.g., 25 for Stygian Lance).
 * @returns {boolean} True if spell cast succeeded and cost was deducted.
 */
export function spendResonance(resonanceState, cost = DEFAULT_COMBAT_CONFIG.stygianLanceCost) {
    if (!resonanceState) return false;
    const safeCost = Number.isFinite(cost) ? Math.max(0, cost) : DEFAULT_COMBAT_CONFIG.stygianLanceCost;

    if (resonanceState.current >= safeCost) {
        resonanceState.current -= safeCost;
        resonanceState.idleTimer = 0.0;
        resonanceState.isOverdrive = (resonanceState.current >= resonanceState.max);
        return true;
    }
    return false;
}

/**
 * Updates resonance over delta time, draining energy after out-of-combat idle delay.
 * @param {ResonanceState} resonanceState - Mutable resonance state.
 * @param {number} dt - Timestep in seconds.
 * @param {CombatConfig} [config] - Balance configuration.
 * @returns {ResonanceState}
 */
export function updateResonance(resonanceState, dt, config = DEFAULT_COMBAT_CONFIG) {
    if (!resonanceState || !Number.isFinite(dt) || dt <= 0) return resonanceState;

    resonanceState.idleTimer += dt;
    const decayDelay = Number.isFinite(config.resonanceDecayDelay) ? config.resonanceDecayDelay : DEFAULT_COMBAT_CONFIG.resonanceDecayDelay;
    const decayRate = Number.isFinite(config.resonanceDecayRate) ? config.resonanceDecayRate : DEFAULT_COMBAT_CONFIG.resonanceDecayRate;

    if (resonanceState.idleTimer >= decayDelay && resonanceState.current > 0) {
        resonanceState.current = Math.max(0.0, resonanceState.current - decayRate * dt);
        resonanceState.isOverdrive = (resonanceState.current >= resonanceState.max);
    }

    return resonanceState;
}

// ============================================================================
// 4. PARABOLIC PROJECTILE TRAJECTORY MATHEMATICS
// ============================================================================

/**
 * Evaluates projectile position along a parabolic arc at time t >= 0:
 * x(t) = x0 + vx0 * t
 * y(t) = y0 + vy0 * t - 0.5 * |g| * t^2
 * z(t) = 0 (2.5D plane constraint)
 * 
 * @param {number} x0 - Initial horizontal position.
 * @param {number} y0 - Initial vertical elevation.
 * @param {number} vx0 - Initial horizontal velocity.
 * @param {number} vy0 - Initial vertical velocity.
 * @param {number} t - Elapsed time in seconds (>= 0).
 * @param {number} [gravity=-26.0] - Downward gravity acceleration.
 * @returns {{ x: number, y: number, z: 0 }}
 */
export function getTrajectoryPosition(x0, y0, vx0, vy0, t, gravity = DEFAULT_COMBAT_CONFIG.defaultGravity) {
    const safeT = Math.max(0, Number.isFinite(t) ? t : 0);
    const absG = Math.abs(Number.isFinite(gravity) ? gravity : DEFAULT_COMBAT_CONFIG.defaultGravity);

    return {
        x: x0 + vx0 * safeT,
        y: y0 + vy0 * safeT - 0.5 * absG * safeT * safeT,
        z: 0
    };
}

/**
 * Evaluates projectile velocity vector along a parabolic arc at time t >= 0:
 * vx(t) = vx0
 * vy(t) = vy0 - |g| * t
 * vz(t) = 0
 * 
 * @param {number} vx0 - Initial horizontal velocity.
 * @param {number} vy0 - Initial vertical velocity.
 * @param {number} t - Elapsed time in seconds (>= 0).
 * @param {number} [gravity=-26.0] - Downward gravity acceleration.
 * @returns {{ vx: number, vy: number, vz: 0 }}
 */
export function getTrajectoryVelocity(vx0, vy0, t, gravity = DEFAULT_COMBAT_CONFIG.defaultGravity) {
    const safeT = Math.max(0, Number.isFinite(t) ? t : 0);
    const absG = Math.abs(Number.isFinite(gravity) ? gravity : DEFAULT_COMBAT_CONFIG.defaultGravity);

    return {
        vx: vx0,
        vy: vy0 - absG * safeT,
        vz: 0
    };
}

/**
 * Calculates the instantaneous flight tangent angle (pitch) in radians.
 * theta(t) = atan2(vy(t), vx(t)).
 * 
 * @param {number} vx0 - Initial horizontal velocity.
 * @param {number} vy0 - Initial vertical velocity.
 * @param {number} t - Elapsed time in seconds.
 * @param {number} [gravity=-26.0] - Downward gravity acceleration.
 * @returns {number} Angle in radians in [-PI, PI].
 */
export function getTrajectoryAngle(vx0, vy0, t, gravity = DEFAULT_COMBAT_CONFIG.defaultGravity) {
    const vel = getTrajectoryVelocity(vx0, vy0, t, gravity);
    return Math.atan2(vel.vy, vel.vx);
}

/**
 * Calculates the apex (peak) of the parabolic arc.
 * t_apex = vy0 / |g| for vy0 > 0.
 * y_apex = y0 + vy0^2 / (2 * |g|).
 * 
 * @param {number} x0 - Initial horizontal position.
 * @param {number} y0 - Initial vertical elevation.
 * @param {number} vx0 - Initial horizontal velocity.
 * @param {number} vy0 - Initial vertical velocity.
 * @param {number} [gravity=-26.0] - Downward gravity acceleration.
 * @returns {{ timeToApex: number, apexX: number, apexY: number }}
 */
export function calculateTrajectoryApex(x0, y0, vx0, vy0, gravity = DEFAULT_COMBAT_CONFIG.defaultGravity) {
    const absG = Math.abs(Number.isFinite(gravity) ? gravity : DEFAULT_COMBAT_CONFIG.defaultGravity);
    if (vy0 <= 0 || absG <= 0) {
        return { timeToApex: 0, apexX: x0, apexY: y0 };
    }

    const tApex = vy0 / absG;
    const apexX = x0 + vx0 * tApex;
    const apexY = y0 + (vy0 * vy0) / (2.0 * absG);
    return { timeToApex: tApex, apexX, apexY };
}

/**
 * Calculates the forward time-of-flight until the projectile descends to target elevation yTarget.
 * Solves y0 + vy0 * t - 0.5 * |g| * t^2 = yTarget.
 * 
 * @param {number} y0 - Initial launch elevation.
 * @param {number} vy0 - Initial vertical velocity.
 * @param {number} [yTarget=0] - Target impact elevation (e.g., ground level = 0).
 * @param {number} [gravity=-26.0] - Downward gravity acceleration.
 * @returns {number} Positive time to impact in seconds, or -1 if elevation is unreachable.
 */
export function calculateFlightTime(y0, vy0, yTarget = 0, gravity = DEFAULT_COMBAT_CONFIG.defaultGravity) {
    const absG = Math.abs(Number.isFinite(gravity) ? gravity : DEFAULT_COMBAT_CONFIG.defaultGravity);
    if (absG <= 0) return -1;

    // Discriminant: vy0^2 + 2 * |g| * (y0 - yTarget)
    const discriminant = (vy0 * vy0) + 2.0 * absG * (y0 - yTarget);
    if (discriminant < 0) {
        // Target elevation is higher than apex: never reached
        return -1;
    }

    const tImpact = (vy0 + Math.sqrt(discriminant)) / absG;
    return Math.max(0, tImpact);
}

/**
 * Mode A Ballistic Solver: Computes initial launch velocity (vx0, vy0) to strike a target
 * at (targetX, targetY) given a designated time-of-flight T > 0.
 * 
 * vx0 = (targetX - x0) / T
 * vy0 = (targetY - y0 + 0.5 * |g| * T^2) / T
 * 
 * @param {number} x0 - Launch origin X.
 * @param {number} y0 - Launch origin Y.
 * @param {number} targetX - Target destination X.
 * @param {number} targetY - Target destination Y.
 * @param {number} timeOfFlight - Desired flight duration in seconds (T > 0).
 * @param {number} [gravity=-26.0] - Downward gravity acceleration.
 * @returns {TrajectoryVector | null} Velocity vector or null if invalid inputs.
 */
export function solveLaunchVelocityForTime(x0, y0, targetX, targetY, timeOfFlight, gravity = DEFAULT_COMBAT_CONFIG.defaultGravity) {
    if (!Number.isFinite(timeOfFlight) || timeOfFlight <= 0) {
        return null;
    }
    const absG = Math.abs(Number.isFinite(gravity) ? gravity : DEFAULT_COMBAT_CONFIG.defaultGravity);

    const vx0 = (targetX - x0) / timeOfFlight;
    const vy0 = (targetY - y0 + 0.5 * absG * timeOfFlight * timeOfFlight) / timeOfFlight;
    const launchAngle = Math.atan2(vy0, vx0);

    return {
        vx: vx0,
        vy: vy0,
        vz: 0,
        timeOfFlight,
        launchAngle
    };
}

/**
 * Mode B Ballistic Solver: Computes initial launch velocity (vx0, vy0) for a fixed launch speed v0.
 * Solves the classical ballistic equation for launch angle theta:
 * tan(theta) = (v0^2 +/- sqrt(v0^4 - g * (g * dx^2 + 2 * dy * v0^2))) / (g * |dx|).
 * 
 * @param {number} x0 - Launch origin X.
 * @param {number} y0 - Launch origin Y.
 * @param {number} targetX - Target destination X.
 * @param {number} targetY - Target destination Y.
 * @param {number} launchSpeed - Fixed speed magnitude v0 > 0.
 * @param {boolean} [preferHighArc=false] - True to lob high over obstacles; false for direct flat arc.
 * @param {number} [gravity=-26.0] - Downward gravity acceleration.
 * @returns {TrajectoryVector | null} Velocity vector or null if target is out of range.
 */
export function solveLaunchVelocityForSpeed(x0, y0, targetX, targetY, launchSpeed, preferHighArc = false, gravity = DEFAULT_COMBAT_CONFIG.defaultGravity) {
    if (!Number.isFinite(launchSpeed) || launchSpeed <= 0) {
        return null;
    }
    const absG = Math.abs(Number.isFinite(gravity) ? gravity : DEFAULT_COMBAT_CONFIG.defaultGravity);
    const dx = targetX - x0;
    const dy = targetY - y0;
    const absDx = Math.abs(dx);

    // Target directly above/below launch point (vertical fire)
    if (absDx < 1e-4) {
        if (dy > 0) {
            const maxH = (launchSpeed * launchSpeed) / (2.0 * absG);
            if (dy > maxH) return null; // out of range
            return {
                vx: 0,
                vy: launchSpeed,
                vz: 0,
                timeOfFlight: calculateFlightTime(y0, launchSpeed, targetY, gravity),
                launchAngle: Math.PI / 2
            };
        } else {
            return {
                vx: 0,
                vy: -launchSpeed,
                vz: 0,
                timeOfFlight: Math.abs(dy) / launchSpeed,
                launchAngle: -Math.PI / 2
            };
        }
    }

    const v2 = launchSpeed * launchSpeed;
    const v4 = v2 * v2;
    // Ballistic Discriminant: v0^4 - g * (g * dx^2 + 2 * dy * v0^2)
    const discriminant = v4 - absG * (absG * absDx * absDx + 2.0 * dy * v2);

    if (discriminant < 0) {
        // Target is beyond maximum ballistic reach at launchSpeed
        return null;
    }

    const sqrtD = Math.sqrt(discriminant);
    const tanTheta = preferHighArc 
        ? (v2 + sqrtD) / (absG * absDx) 
        : (v2 - sqrtD) / (absG * absDx);

    const theta = Math.atan(tanTheta);
    const dirX = dx >= 0 ? 1 : -1;
    const vx0 = dirX * launchSpeed * Math.cos(theta);
    const vy0 = launchSpeed * Math.sin(theta);
    const timeOfFlight = absDx / Math.abs(vx0);

    return {
        vx: vx0,
        vy: vy0,
        vz: 0,
        timeOfFlight,
        launchAngle: Math.atan2(vy0, vx0)
    };
}

/**
 * Samples discrete coordinates along a parabolic trajectory for predictive visualization
 * or swept continuous raycasting.
 * 
 * @param {number} x0 - Launch origin X.
 * @param {number} y0 - Launch origin Y.
 * @param {number} vx0 - Initial horizontal velocity.
 * @param {number} vy0 - Initial vertical velocity.
 * @param {number} maxTime - End time of trajectory in seconds.
 * @param {number} [numSegments=20] - Number of segments to divide trajectory into.
 * @param {number} [gravity=-26.0] - Downward gravity acceleration.
 * @returns {Array<{ x: number, y: number, z: 0, t: number }>}
 */
export function sampleTrajectoryPoints(x0, y0, vx0, vy0, maxTime, numSegments = 20, gravity = DEFAULT_COMBAT_CONFIG.defaultGravity) {
    const points = [];
    const safeMaxT = Math.max(0, Number.isFinite(maxTime) ? maxTime : 0);
    const segments = Math.max(1, Math.min(100, numSegments));

    for (let i = 0; i <= segments; i++) {
        const t = (i / segments) * safeMaxT;
        const pos = getTrajectoryPosition(x0, y0, vx0, vy0, t, gravity);
        points.push({
            x: pos.x,
            y: pos.y,
            z: 0,
            t
        });
    }

    return points;
}

// Support CommonJS environments (Node.js test runners)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        DEFAULT_COMBAT_CONFIG,
        getComboDamage,
        calculateDamageMitigation,
        calculateRiposteDamage,
        applyDamage,
        createPoiseState,
        applyPoiseDamage,
        updatePoise,
        createResonanceState,
        addResonance,
        spendResonance,
        updateResonance,
        getTrajectoryPosition,
        getTrajectoryVelocity,
        getTrajectoryAngle,
        calculateTrajectoryApex,
        calculateFlightTime,
        solveLaunchVelocityForTime,
        solveLaunchVelocityForSpeed,
        sampleTrajectoryPoints
    };
}
```

---

## 5. Edge Cases, Defensive Guards & Threat Modeling

| Category | Boundary Condition / Edge Case | Failure Mode Without Guard | Mathematical / Algorithmic Guard Rail |
|---|---|---|---|
| **Defense Singularity** | Defense input is $-100$ or below (e.g. from stacking vulnerability debuffs) | Division by zero or negative denominator, resulting in `Infinity` or inverted damage | Defense is clamped from below at `minDefense = -90`. Denominator $1 + \text{def}/100 \ge 0.1$, capping max damage amplification at $10\times$. |
| **Negative Damage** | Raw damage passed as negative number ($D_{\text{raw}} = -50$) | Target heals HP instead of taking damage | Explicit check: `if (!Number.isFinite(rawDamage) \|\| rawDamage <= 0) return 0;` ensures damage is strictly non-negative. |
| **Zero Damage Exploit** | High defense (e.g. $\text{defense} = 5000$) reduces damage to $0.002$ | Entity becomes completely invulnerable to all normal attacks | $\max(1, \text{mitigated})$ guarantees minimum $1$ point of chip damage for any attack where $D_{\text{raw}} \ge 1$. |
| **NaN / Infinity Pollution** | Uninitialized entity fields or corrupted network payloads pass `NaN` | `NaN` propagates through calculations, breaking health bars and crashing physics | All inputs validated with `Number.isFinite()`, falling back to safe defaults ($0$ or config constants). |
| **Poise Underflow** | Massive overkill poise damage ($+500$ poise damage against $40$ poise) | Negative poise values cause corrupted recovery timers or double staggers | `currentPoise = Math.max(0, currentPoise - dmg)` clamps poise to $0.0$. |
| **Stagger Loop Exploit** | Attacking an enemy that is already staggered inflicts more poise damage | Enemy gets trapped in perpetual stagger, resetting stagger timer indefinitely | Guard in `applyPoiseDamage()`: if `poiseState.isStaggered == true`, return immediately without resetting `staggerTimer`. |
| **Resonance Overfill / Drain** | Rapid attacks accumulate $+300$ resonance; long pauses drain below $0$ | Gauge exceeds HUD bar ($> 100$) or becomes negative ($< 0$) | Clamped strictly to $[0.0, 100.0]$: `Math.min(max, Math.max(0, current + amount))`. |
| **Resonance Decay Race** | Player strikes an enemy while out-of-combat decay is running | Resonance continues to drain even though player is actively fighting | Any positive resonance gain (`addResonance`) or spell cast immediately resets `idleTimer = 0.0`. |
| **Unreachable Ballistic Target** | Target elevation is higher than maximum apex height for given launch velocity | Radical $\Delta < 0$ in quadratic formula yields `NaN` | `calculateFlightTime()` checks discriminant $\Delta < 0$, safely returning $-1$ without taking `Math.sqrt()`. |
| **Ballistic Range Exceeded** | Archer attempts to target player 50 meters away with fixed speed $v_0 = 14\text{ m/s}$ | $D_{\text{ballistic}} < 0$, `Math.sqrt()` returns `NaN` | `solveLaunchVelocityForSpeed()` validates $D_{\text{ballistic}} \ge 0$; returns `null` if target is out of range. |
| **Vertical Alignment Ballistics** | Target is directly above launch origin ($\Delta x = 0$) | Division by $\Delta x = 0$ yields `Infinity` in $\tan \theta$ calculation | Special case handled explicitly: $\Delta x < 10^{-4}$ calculates pure vertical flight with $\theta = \pm 90^\circ$. |
| **Negative Time of Flight** | Caller passes non-positive flight duration ($T \le 0$) to target solver | Division by zero or backwards trajectory | Guard: `if (!Number.isFinite(T) \|\| T <= 0) return null;`. |

---

## 6. Analytical Verification Benchmarks & Test Vectors

These exact analytical numbers serve as ground truth for unit tests and automated regression assertions.

### 6.1 Combo Damage Scaling:
- Hit 1: $22$
- Hit 2: $28$
- Hit 3 (Finisher): $48$

### 6.2 Critical Riposte Multiplier ($2.5\times$):
- Staggered Hit 1: $22 \times 2.5 = 55$
- Staggered Hit 2: $28 \times 2.5 = 70$
- Staggered Hit 3: $48 \times 2.5 = 120$
- Staggered Heavy Cleave ($70$): $70 \times 2.5 = 175$

### 6.3 Defense Mitigation ($K = 100$):
- $D_{\text{raw}} = 22, \text{def} = 0 \implies D_{\text{taken}} = \text{round}(22 / 1.0) = 22$
- $D_{\text{raw}} = 22, \text{def} = 50 \implies D_{\text{taken}} = \text{round}(22 / 1.5) = \text{round}(14.6667) = 15$
- $D_{\text{raw}} = 22, \text{def} = 100 \implies D_{\text{taken}} = \text{round}(22 / 2.0) = 11$
- $D_{\text{raw}} = 48, \text{def} = 100 \implies D_{\text{taken}} = \text{round}(48 / 2.0) = 24$
- $D_{\text{raw}} = 48, \text{def} = 200 \implies D_{\text{taken}} = \text{round}(48 / 3.0) = 16$
- $D_{\text{raw}} = 48, \text{def} = 300 \implies D_{\text{taken}} = \text{round}(48 / 4.0) = 12$
- $D_{\text{raw}} = 22, \text{def} = 10000 \implies \max(1, \text{round}(22 / 101)) = \max(1, 0) = 1$ (Chip damage)
- $D_{\text{raw}} = 22, \text{def} = -50 \implies D_{\text{taken}} = \text{round}(22 / 0.5) = 44$ (Amplified vulnerability)
- $D_{\text{raw}} = 22, \text{def} = -90 \implies D_{\text{taken}} = \text{round}(22 / 0.1) = 220$ (Max $10\times$ cap)

### 6.4 Poise Depletion & Stagger Threshold:
- Ashen Footman ($P_{\max} = 40$):
  - Hit 1 ($15$ poise dmg): $40 - 15 = 25$ poise remaining ($\neg \text{staggered}$).
  - Hit 2 ($20$ poise dmg): $25 - 20 = 5$ poise remaining ($\neg \text{staggered}$).
  - Hit 3 ($15$ poise dmg): $5 - 15 = -10 \to 0$ poise $\implies \text{isStaggered} = \text{true}$, $\text{staggerTimer} = 1.2\text{ s}$.
- Heavy Cleave ($80$ poise dmg) on Ashen Footman ($40$):
  - $40 - 80 = -40 \to 0 \implies \text{isStaggered} = \text{true}$ in 1 single hit.
- Perfect Parry ($100$ poise dmg) on Ashen Footman ($40$):
  - $40 - 100 = -60 \to 0 \implies \text{isStaggered} = \text{true}$ in 1 single parry.

### 6.5 Stygian Resonance Gauge:
- Initial: $0$
- Hit 1: $+15 \implies 15$
- Hit 2: $+15 \implies 30$
- Hit 3: $+25 \implies 55$
- Spell Cast (Stygian Lance, cost $25$): $55 - 25 = 30$
- Perfect Parry: $+100 \implies \min(100, 30 + 100) = 100$ (Overdrive active)
- Idle for $4.0\text{ s}$: decay begins. At $t = 6.0\text{ s}$ ($2.0\text{ s}$ decay): $100 - (5.0 \times 2.0) = 90$ (Overdrive ends).

### 6.6 Parabolic Projectile Ballistics:
- Let $g = -26.0\text{ m/s}^2 \implies |g| = 26.0$.
- Launch: $x_0 = 0, y_0 = 4$ (Archer on turret).
- Initial velocity: $v_{x0} = 12.0\text{ m/s}, v_{y0} = 9.0\text{ m/s}$.
- **Apex**:
  - $t_{\text{apex}} = 9.0 / 26.0 \approx 0.34615\text{ s}$.
  - $y_{\text{apex}} = 4.0 + (9.0^2) / (2 \times 26.0) = 4.0 + 81.0 / 52.0 = 4.0 + 1.55769 = 5.55769\text{ m}$.
  - $x_{\text{apex}} = 0 + 12.0 \times 0.34615 = 4.1538\text{ m}$.
- **Ground Impact ($y_{\text{target}} = 0$)**:
  - Discriminant: $v_{y0}^2 + 2 |g| (y_0 - y_{\text{target}}) = 9.0^2 + 2 \times 26.0 \times 4.0 = 81 + 208 = 289$.
  - $\sqrt{289} = 17.0$.
  - $t_{\text{impact}} = (9.0 + 17.0) / 26.0 = 26.0 / 26.0 = 1.0000\text{ s}$ (Exact integer flight time!).
  - $x_{\text{impact}} = x_0 + v_{x0} \times 1.0 = 0 + 12.0 \times 1.0 = 12.000\text{ m}$.
  - $y(1.0) = 4.0 + 9.0(1.0) - 0.5(26.0)(1.0)^2 = 4 + 9 - 13 = 0.000\text{ m}$ (Exact landing!).
  - $v_y(1.0) = 9.0 - 26.0(1.0) = -17.0\text{ m/s}$.
  - Tangent pitch angle at impact: $\theta = \text{atan2}(-17.0, 12.0) \approx -0.9560\text{ rad} \approx -54.78^\circ$.

---

## 7. Complete Unit Test Suite (`tests/unit/combat_math.test.js`)

Below is the verified test specification designed for Node.js native test runner (`node --test tests/unit/combat_math.test.js`):

```javascript
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    DEFAULT_COMBAT_CONFIG,
    getComboDamage,
    calculateDamageMitigation,
    calculateRiposteDamage,
    applyDamage,
    createPoiseState,
    applyPoiseDamage,
    updatePoise,
    createResonanceState,
    addResonance,
    spendResonance,
    updateResonance,
    getTrajectoryPosition,
    getTrajectoryVelocity,
    getTrajectoryAngle,
    calculateTrajectoryApex,
    calculateFlightTime,
    solveLaunchVelocityForTime,
    solveLaunchVelocityForSpeed,
    sampleTrajectoryPoints
} from '../../src/engine/combat_math.js';

describe('Combat Math Specification Suite', () => {

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

        it('handles negative defense (vulnerability / armor shred) up to 10x cap safely', () => {
            // Defense = -50 -> 22 / 0.5 = 44 (2x damage)
            assert.equal(calculateDamageMitigation(22, -50), 44);

            // Defense = -90 -> 22 / 0.1 = 220 (10x cap)
            assert.equal(calculateDamageMitigation(22, -90), 220);

            // Defense = -200 (clamped to -90) -> no division by zero!
            assert.equal(calculateDamageMitigation(22, -200), 220);
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

            // Advance past delay (another 1.5s -> total 3.5s >= 3.0s)
            updatePoise(state, 1.5);
            // Regenerates at 20 u/s for 1.5s = +30 poise -> 80
            assert.ok(Math.abs(state.currentPoise - 80) < 1e-4);
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

            // 1.5 more seconds (total 4.5s >= 4.0s delay)
            updateResonance(state, 1.5);
            // Drains for 1.5s * 5.0 = 7.5 units -> 42.5
            assert.ok(Math.abs(state.current - 42.5) < 1e-4);
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
```

---

## 8. Summary of Interface Exports

The following table summarizes all symbols exported by `src/engine/combat_math.js`:

| Export Symbol | Type | Mathematical Responsibility |
|---|---|---|
| `DEFAULT_COMBAT_CONFIG` | `Object (frozen)` | Immutable tuning parameters for damages, poise, resonance, and ballistics |
| `getComboDamage(step, damages)` | `Function` | Resolves unmitigated combo damage: $22 \to 28 \to 48$ |
| `calculateDamageMitigation(raw, def, cfg)` | `Function` | Hyperbolic armor mitigation $D_{\text{taken}} = \max(1, \text{round}(D_{\text{raw}} / (1 + \text{def}/100)))$ |
| `calculateRiposteDamage(base, staggered, mult)` | `Function` | Multiplies base damage by $2.5\times$ if target is staggered |
| `applyDamage(target, pkg, cfg)` | `Function` | Full combat hit resolution: parry, I-frames, shield, riposte, mitigation, HP deduction |
| `createPoiseState(max, rate, delay)` | `Function` | Factory creating clean `PoiseState` container |
| `applyPoiseDamage(state, dmg, cfg)` | `Function` | Depletes poise $\max(0, P - \Delta P)$ and triggers `STAGGER` ($1.2\text{ s}$) if $P \le 0$ |
| `updatePoise(state, dt)` | `Function` | Advances stagger timer, restores poise on recovery, or regenerates poise |
| `createResonanceState(initial, max)` | `Function` | Factory creating clean `ResonanceState` container |
| `addResonance(state, amount, cfg)` | `Function` | Accumulates resonance ($+15$ hit, $+100$ parry) bounded in $[0, 100]$ |
| `spendResonance(state, cost)` | `Function` | Checks and consumes resonance for spells ($25$ for Stygian Lance) |
| `updateResonance(state, dt, cfg)` | `Function` | Drains resonance at $5.0\text{ u/s}$ after $4.0\text{ s}$ out-of-combat idle |
| `getTrajectoryPosition(x0, y0, vx0, vy0, t, g)` | `Function` | Computes 2.5D position along parabolic arc: $\vec{r}(t) = \vec{r}_0 + \vec{v}_0 t + \frac{1}{2}\vec{g} t^2$ |
| `getTrajectoryVelocity(vx0, vy0, t, g)` | `Function` | Computes instantaneous velocity vector: $v_x = v_{x0}, v_y = v_{y0} - |g|t$ |
| `getTrajectoryAngle(vx0, vy0, t, g)` | `Function` | Computes tangent flight angle $\text{atan2}(v_y(t), v_x(t))$ for mesh orientation |
| `calculateTrajectoryApex(x0, y0, vx0, vy0, g)` | `Function` | Computes peak arc time $t_{\text{apex}} = v_{y0}/|g|$ and apex elevation $y_{\text{apex}}$ |
| `calculateFlightTime(y0, vy0, yTarget, g)` | `Function` | Solves quadratic impact time to target elevation $y_{\text{target}}$ |
| `solveLaunchVelocityForTime(x0, y0, tx, ty, T, g)` | `Function` | Mode A: Solves exact velocity $\vec{v}_0$ for designated flight time $T > 0$ |
| `solveLaunchVelocityForSpeed(x0, y0, tx, ty, v0, highArc, g)` | `Function` | Mode B: Solves dual ballistic angles (low vs high arc) for fixed speed $v_0$ |
| `sampleTrajectoryPoints(x0, y0, vx0, vy0, maxT, n, g)` | `Function` | Generates discrete 2.5D coordinates along arc for visual paths or raycasts |

---

*Specification verified against all Vaelthorn design documentation and codebase references.*
