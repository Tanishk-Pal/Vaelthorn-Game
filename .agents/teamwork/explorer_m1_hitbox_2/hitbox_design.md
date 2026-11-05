# Hitbox & Collision Math Engine Specification (`src/engine/hitbox.js`)
**Author:** `explorer_m1_hitbox_2` (Hitbox Exploration Specialist)  
**Date:** 2026-11-01  
**Project:** Vaelthorn: The Oath of Darkness  
**Target Module:** `src/engine/hitbox.js`  
**Test Suite:** `tests/unit/hitbox.test.js`

---

## 1. Executive Summary & Design Scope

The 2.5D combat system of *Vaelthorn: The Oath of Darkness* requires precise geometric overlap calculations, directional physics projection, and deterministic event filtering. Gameplay is strictly locked to the $Z = 0$ vertical plane while rendering in 3D WebGL.

### Primary Objectives:
1. **Mathematical Rigor**: Replace ad-hoc 1D distance checks with true 2D Axis-Aligned Bounding Box (AABB) intersection mathematics locked to $Z = 0$.
2. **Prototype Bug Resolution**: Eliminate the vertical collision vulnerability in `Vaelthorn_Playable_Prototype.html` where height was unconstrained ($|x_A - x_B| < 2.4$ with no $Y$ check).
3. **Dynamic Swing Bounds**: Calculate directional weapon swing hitboxes spanning reach, height, and offset based on attacker position and facing direction ($\pm 1$).
4. **Ranged Piercing Ray/Beam Math**: Compute piercing beam bounding volumes and slab-method ray-AABB intersections for the *Stygian Lance* railgun spell ($16\text{ m}$ range, $1.0\text{ m}$ vertical thickness).
5. **Duplicate Hit Suppression (`HitTracker`)**: Prevent multi-frame damage duplication during multi-frame active swing windows via a zero-allocation, reusable entity hit-tracking structure.
6. **2.5D Directional Knockback Engine**: Generate physically accurate impulse vectors $\{ v_x, v_y, v_z \}$ with horizontal directionality, slight vertical pop ($0.3$), zero $Z$-drift, and edge-case guards for coincident entities.
7. **Production Worker Contract**: Provide complete JavaScript function signatures, constants, JSDoc typedefs, and verified numerical test vectors for implementation.

---

## 2. 2.5D Geometric Coordinate System & Overlap Equations

### 2.1 Coordinate Conventions
The world coordinate system follows standard right-handed Cartesian geometry:
- **$X$ Axis (Horizontal Locomotion)**: $-\infty < x < +\infty$. Positive is **Right** ($F = +1$), Negative is **Left** ($F = -1$).
- **$Y$ Axis (Vertical Height)**: $y \ge 0$ is altitude above ground plane ($y = 0$ is ground level). Positive is **Up**, Negative is **Down**.
- **$Z$ Axis (Depth / Lateral Plane)**: Confined to $z \equiv 0.0\text{ m}$. Meshes possess cosmetic depth within $[-0.5, +0.5]\text{ m}$, but collision logic operates on $Z = 0$.

### 2.2 Canonical 2.5D Bounding Box Representation
A 2.5D bounding box is defined by closed spatial intervals across $[x_{\min}, x_{\max}]$, $[y_{\min}, y_{\max}]$, and optional depth bounds $[z_{\min}, z_{\max}]$:

$$\mathcal{B} = \left\{ (x, y, z) \in \mathbb{R}^3 \;\middle|\; x_{\min} \le x \le x_{\max} \;\land\; y_{\min} \le y \le y_{\max} \;\land\; |z| \le \epsilon_z \right\}$$

Where:
- $x_{\min} \le x_{\max}$ (normalized horizontal interval)
- $y_{\min} \le y_{\max}$ (normalized vertical interval)
- $\epsilon_z = 0.5\text{ m}$ (standard lateral tolerance for 2.5D depth checks)

```javascript
/**
 * @typedef {Object} AABB
 * @property {number} minX - Minimum X coordinate (meters)
 * @property {number} maxX - Maximum X coordinate (meters)
 * @property {number} minY - Minimum Y coordinate (meters)
 * @property {number} maxY - Maximum Y coordinate (meters)
 * @property {number} [minZ=-0.5] - Minimum Z coordinate (meters)
 * @property {number} [maxZ=0.5]  - Maximum Z coordinate (meters)
 */
```

### 2.3 2D Overlap Theorem (Separating Axis Theorem in 2D)
Two 2.5D bounding boxes $\mathcal{A}$ and $\mathcal{B}$ intersect if and only if their projections overlap simultaneously along both independent cardinal axes $X$ and $Y$ (with optional depth alignment check):

$$\mathcal{A} \cap \mathcal{B} \neq \emptyset \iff \left( \mathcal{I}_x(\mathcal{A}, \mathcal{B}) \land \mathcal{I}_y(\mathcal{A}, \mathcal{B}) \land \mathcal{I}_z(\mathcal{A}, \mathcal{B}) \right)$$

Where:
$$\mathcal{I}_x(\mathcal{A}, \mathcal{B}) \equiv \left( x_{\min, \mathcal{A}} \le x_{\max, \mathcal{B}} \right) \land \left( x_{\max, \mathcal{A}} \ge x_{\min, \mathcal{B}} \right)$$
$$\mathcal{I}_y(\mathcal{A}, \mathcal{B}) \equiv \left( y_{\min, \mathcal{A}} \le y_{\max, \mathcal{B}} \right) \land \left( y_{\max, \mathcal{A}} \ge y_{\min, \mathcal{B}} \right)$$
$$\mathcal{I}_z(\mathcal{A}, \mathcal{B}) \equiv \left( z_{\min, \mathcal{A}} \le z_{\max, \mathcal{B}} \right) \land \left( z_{\max, \mathcal{A}} \ge z_{\min, \mathcal{B}} \right)$$

#### Strict vs. Inclusive Overlap:
- **Inclusive Boundary ($\le, \ge$)**: Two boxes touching at an exact face or edge ($x_{\max, \mathcal{A}} = x_{\min, \mathcal{B}}$) are considered overlapping. Recommended for trigger hitboxes to prevent tunneling on exact boundary contacts.
- **Strict Boundary ($<, >$)**: Requires non-zero interior area overlap ($x_{\min, \mathcal{A}} < x_{\max, \mathcal{B}} \land x_{\max, \mathcal{A}} > x_{\min, \mathcal{B}}$). Useful for non-penetrable solid terrain resolution.
- The default implementation in `check2DOverlap` defaults to **inclusive** (`inclusive = true`).

---

## 3. Analysis of Vulnerabilities in `Vaelthorn_Playable_Prototype.html`

In the graybox prototype (`Vaelthorn_Playable_Prototype.html`), hit detection was implemented as:

```javascript
// Prototype Implementation (Vaelthorn_Playable_Prototype.html:759-765)
const dist = Math.abs(Player.x - dummyGroup.position.x);
const inFront = Player.facingRight 
    ? (dummyGroup.position.x > Player.x) 
    : (dummyGroup.position.x < Player.x);

if (dist < 2.4 && inFront) {
    // Deal damage...
}
```

### Critical Flaws Identified:
1. **Zero Vertical Dimension Check ($\Delta Y$ Ignored)**:
   - The test purely checks $|x_{\text{player}} - x_{\text{target}}| < 2.4$.
   - **Exploit / Glitch 1 (High Air Target)**: If an enemy is $10\text{ m}$ up in the air (e.g., hovering *Wisp of the Hollow Crown* at $y = 4.0\text{ m}$ or an archer on an elevated platform at $y = 6.0\text{ m}$), a grounded sword swing ($y = 0$) erroneously deals full melee damage.
   - **Exploit / Glitch 2 (Player Jumping)**: If the player jumps to peak apex ($h = 2.4\text{ m}$), swinging the sword in mid-air still strikes grounded crawlers and training dummies at $y = 0$, even though the visual sword is $2.0\text{ m}$ above the target's head.
   - **Exploit / Glitch 3 (Pit Fall)**: Enemies located below the player in pits or trapdoors take damage from swings above the floor.
2. **Missing Raycast Thickness for Stygian Lance**:
   - The spell beam logic (`Vaelthorn_Playable_Prototype.html:817-822`) used `dist < 16 && inFront` with zero vertical bounds. A horizontal starlight beam at chest height ($y = 1.2\text{ m}$) hits enemies regardless of elevation, breaking platforming gameplay.
3. **Continuous-Frame Damage Duplication**:
   - If an attack lasts $0.22\text{ s}$ across 13 frames and an enemy stays within range, a multi-frame trigger without duplicate suppression damages the enemy on every single frame, causing instant kills.

---

## 4. Attack Swing Hitbox Computation

A character performing a melee attack projects a dynamic 2.5D active hitbox into world space based on their position, facing direction, weapon reach, swing height, and vertical offset.

```
                  [Y_max = Py + yOffset + swingHeight/2]
              +-----------------------------------------+
              |                                         |
              |            ACTIVE SWING HITBOX          |
              |                                         |
              |       (Sword Cleave Arc Volume)         |
  Attacker    |                                         |
   (Px, Py)   |                                         |
     [o]======|========================================>| (Reach Rx)
      |       |                                         |
     / \      +-----------------------------------------+
              [Y_min = Py + yOffset - swingHeight/2]
      |<----->|
      rearOffset
```

### 4.1 Mathematical Formulation

Let:
- Attacker base coordinate: $\vec{P}_{\text{atk}} = (P_x, P_y, 0)$
- Facing direction: $F \in \{-1, +1\}$ (where $+1$ = Right, $-1$ = Left)
- Weapon horizontal reach: $R_x > 0$ (default $2.4\text{ m}$ for Ashen Longsword)
- Swing vertical height: $H_y > 0$ (default $1.8\text{ m}$)
- Vertical center offset: $Y_{\text{off}}$ (default $0.9\text{ m}$ above player base)
- Rear protection margin: $B_x \ge 0$ (default $0.2\text{ m}$, covers point-blank collision with enemies partially clipping into attacker)

The attack swing bounding box $\mathcal{B}_{\text{swing}}$ is computed as:

#### Horizontal Extents ($X$):
$$x_{\min} = \begin{cases} P_x - B_x & \text{if } F = +1 \quad (\text{Facing Right}) \\ P_x - R_x & \text{if } F = -1 \quad (\text{Facing Left}) \end{cases}$$

$$x_{\max} = \begin{cases} P_x + R_x & \text{if } F = +1 \quad (\text{Facing Right}) \\ P_x + B_x & \text{if } F = -1 \quad (\text{Facing Left}) \end{cases}$$

#### Vertical Extents ($Y$):
$$y_{\min} = P_y + Y_{\text{off}} - \frac{H_y}{2}$$
$$y_{\max} = P_y + Y_{\text{off}} + \frac{H_y}{2}$$

#### Lateral Extents ($Z$):
$$z_{\min} = -\epsilon_z = -0.5\text{ m}, \quad z_{\max} = +\epsilon_z = +0.5\text{ m}$$

### 4.2 Standard Weapon Hitbox Archetypes
| Weapon Archetype | Reach $R_x$ ($\text{m}$) | Height $H_y$ ($\text{m}$) | $Y_{\text{off}}$ ($\text{m}$) | Rear $B_x$ ($\text{m}$) | Notes |
|:---|:---:|:---:|:---:|:---:|:---|
| **Ashen Longsword ("Penumbra")** | $2.4$ | $1.8$ | $0.9$ | $0.20$ | Standard balanced arc |
| **Executioner's Great-Mace** | $3.0$ | $2.4$ | $1.0$ | $0.35$ | Heavy ground-pound & tall overhead |
| **Twin Eclipse Daggers** | $1.5$ | $1.2$ | $0.8$ | $0.15$ | Fast short-range sweeps |
| **Ashen Footman Sword** | $2.0$ | $1.6$ | $0.8$ | $0.10$ | Telegraphed enemy slash |
| **Vael-Krag Bell Club Sweep** | $4.5$ | $3.0$ | $1.5$ | $0.50$ | Massive boss sweep |

---

## 5. Ranged Piercing Beam & Raycast Mathematics

### 5.1 Stygian Lance Railgun Beam AABB
The *Stygian Lance* spell casts an instantaneous piercing horizontal beam originating from the player's chest height and extending $L_{\text{beam}} = 16.0\text{ m}$ in the facing direction $F \in \{-1, +1\}$, with a vertical beam thickness $\Delta y = 1.0\text{ m}$.

```
  Y
  ^                   Beam Thickness Dy = 1.0 m
  |       +=======================================================+
Py+1.7 ---|-------------------------------------------------------|
Py+1.2 [o]|=================== STYGIAN LANCE =====================> (16 m)
Py+0.7 ---|-------------------------------------------------------|
  |       +=======================================================+
  +--------------------------------------------------------------------> X
         Px                                                    Px + 16
```

#### Beam Bounding Box Equations:
Given origin $(P_x, P_y + 1.2\text{ m})$:
$$x_{\min} = \begin{cases} P_x & \text{if } F = +1 \\ P_x - 16.0 & \text{if } F = -1 \end{cases}$$
$$x_{\max} = \begin{cases} P_x + 16.0 & \text{if } F = +1 \\ P_x & \text{if } F = -1 \end{cases}$$
$$y_{\min} = (P_y + 1.2) - \frac{\Delta y}{2} = P_y + 0.70\text{ m}$$
$$y_{\max} = (P_y + 1.2) + \frac{\Delta y}{2} = P_y + 1.70\text{ m}$$
$$z_{\min} = -0.5\text{ m}, \quad z_{\max} = +0.5\text{ m}$$

Because the Stygian Lance is a piercing beam, it tests overlap against **all** active enemy hurtboxes in the scene, damaging every enemy whose hurtbox intersects $\mathcal{B}_{\text{beam}}$.

### 5.2 Generalized Raycast vs. 2.5D AABB Intersection (Slab Method)
For general projectiles (such as the *Cinder-Bough Archer* flaming stakes traveling at angle $\theta$), ray-AABB intersection is computed using the Kay-Kajiya Slab Method in 2D.

A ray is defined by origin $\vec{O} = (O_x, O_y)$ and normalized direction vector $\vec{D} = (D_x, D_y)$ over parameter $t \in [0, t_{\max}]$:

$$\vec{R}(t) = \vec{O} + t \cdot \vec{D}$$

The intersection interval $[t_{\text{enter}}, t_{\text{exit}}]$ with box $\mathcal{B} = [x_{\min}, x_{\max}] \times [y_{\min}, y_{\max}]$ is given by:

#### X-Slab:
If $|D_x| > 10^{-7}$:
$$t_{x1} = \frac{x_{\min} - O_x}{D_x}, \quad t_{x2} = \frac{x_{\max} - O_x}{D_x}$$
$$t_{x,\min} = \min(t_{x1}, t_{x2}), \quad t_{x,\max} = \max(t_{x1}, t_{x2})$$
Else ($D_x = 0$, ray parallel to Y axis):
If $O_x < x_{\min} \lor O_x > x_{\max} \implies \text{No Intersection}$
$$t_{x,\min} = -\infty, \quad t_{x,\max} = +\infty$$

#### Y-Slab:
If $|D_y| > 10^{-7}$:
$$t_{y1} = \frac{y_{\min} - O_y}{D_y}, \quad t_{y2} = \frac{y_{\max} - O_y}{D_y}$$
$$t_{y,\min} = \min(t_{y1}, t_{y2}), \quad t_{y,\max} = \max(t_{y1}, t_{y2})$$
Else ($D_y = 0$, ray parallel to X axis):
If $O_y < y_{\min} \lor O_y > y_{\max} \implies \text{No Intersection}$
$$t_{y,\min} = -\infty, \quad t_{y,\max} = +\infty$$

#### Composite Interval:
$$t_{\text{enter}} = \max(t_{x,\min}, t_{y,\min})$$
$$t_{\text{exit}} = \min(t_{x,\max}, t_{y,\max})$$

#### Intersection Condition:
$$\text{Hit} \iff \left( t_{\text{enter}} \le t_{\text{exit}} \right) \land \left( t_{\text{exit}} \ge 0 \right) \land \left( t_{\text{enter}} \le t_{\max} \right)$$

If $\text{Hit} = \text{true}$, the distance to first contact is:
$$t_{\text{hit}} = \max(0, t_{\text{enter}})$$
$$\vec{P}_{\text{hit}} = \vec{O} + t_{\text{hit}} \cdot \vec{D}$$

---

## 6. Duplicate Hit Suppression Architecture (`HitTracker`)

### 6.1 The Problem of Multi-Frame Attack Persistence
A melee attack animation consists of three distinct phases:
1. **Wind-up Phase** ($0.00\text{ s} - 0.08\text{ s}$): Hitbox inactive.
2. **Active Swing Phase** ($0.08\text{ s} - 0.22\text{ s}$, duration $\approx 0.14\text{ s}$ / $\approx 8-9$ frames at 60fps): Hitbox is active.
3. **Recovery Phase** ($0.22\text{ s} - 0.35\text{ s}$): Hitbox disabled.

During the active swing phase, the physics system executes the overlap query on every simulation frame. Without stateful suppression, a target remaining inside the swing volume will register 8-9 distinct hits, receiving massive unintended damage ($8 \times 22 = 176$ HP).

### 6.2 `HitTracker` Class Specification
`HitTracker` manages target registration on a per-swing basis using a high-performance `Set<string | number>`:

```
[Start Attack Swing (e.g. Swing #1)]
                |
         HitTracker.reset()  <--- Clears internal Set (retains capacity)
                |
   +------------v------------+
   |  Frame Loop (Active)    |
   |                         |
   | Overlap detected with   |
   | Entity ID: E42          |
   +------------+------------+
                |
     hitTracker.hasHit(E42)?
       /                 \
     YES                  NO
     /                     \
[Ignore Collision]    [hitTracker.registerHit(E42)]
(Zero damage dealt)            |
                      [Execute Damage & Knockback]
```

#### Lifecycle Methods:
- `hasHit(targetId)`: Fast $O(1)$ query returning `true` if `targetId` was already struck during the active swing.
- `registerHit(targetId)`: Adds `targetId` to the set. Returns `true` if this was a new hit, or `false` if it was already recorded.
- `reset()` / `clear()`: Clears all tracked entities at the start of a new swing.
- `track(swingId, targetId)`: Advanced multi-swing variant; if `swingId` differs from previous swing, the tracker auto-resets without manual intervention.

---

## 7. 2.5D Directional Knockback Engine

When a melee hit or projectile impacts a target entity, it applies an instantaneous kinematic velocity impulse $\vec{v}_{\text{kb}} = (v_x, v_y, v_z)$ to the target.

### 7.1 Velocity Vector Formulation

Given:
- Source / Attacker Position: $\vec{P}_{\text{atk}} = (P_{\text{atk}, x}, P_{\text{atk}, y}, P_{\text{atk}, z})$
- Target Position: $\vec{P}_{\text{tgt}} = (P_{\text{tgt}, x}, P_{\text{tgt}, y}, P_{\text{tgt}, z})$
- Scalar Knockback Force: $F_{\text{kb}} > 0$ (nominal $6.0\text{ m/s}$)
- Attacker Facing: $F_{\text{atk}} \in \{-1, +1\}$
- Target Resistance: $R_{\text{kb}} \in [0, 1.0]$ (e.g. $0$ = normal, $0.5$ = heavy knight, $1.0$ = immovable boss)

#### Step 1: Horizontal Displacement Vector
$$\Delta x = P_{\text{tgt}, x} - P_{\text{atk}, x}$$

#### Step 2: Directional Sign & Coincident Resolution
If the attacker and target are perfectly overlapping ($|\Delta x| < 10^{-5}$), standard `Math.sign(0)` evaluates to `0`, which would extinguish horizontal knockback. We resolve this by falling back to the attacker's forward facing direction:

$$\text{dir}_x = \begin{cases}
+1 & \text{if } \Delta x > 10^{-5} \\
-1 & \text{if } \Delta x < -10^{-5} \\
F_{\text{atk}} & \text{if } |\Delta x| \le 10^{-5} \land F_{\text{atk}} \neq 0 \\
+1 & \text{otherwise}
\end{cases}$$

#### Step 3: Vertical Pop Ratio
In 2.5D platformers, horizontal knockback alone causes entities to scrape horizontally against the ground. An upward vertical pop fraction $c_y = 0.30$ lifts the target slightly off the floor, giving tactile weight and allowing aerodynamic deceleration.

#### Step 4: Final Velocity Vector
$$v_x = \text{dir}_x \cdot F_{\text{kb}} \cdot (1 - R_{\text{kb}})$$
$$v_y = 0.30 \cdot F_{\text{kb}} \cdot (1 - R_{\text{kb}})$$
$$v_z \equiv 0.0\text{ m/s}$$

```javascript
// Result Vector Object
{
    vx: dirX * effectiveForce,
    vy: 0.30 * effectiveForce,
    vz: 0.0
}
```

---

## 8. Interface Contract & Function Signatures (`src/engine/hitbox.js`)

Below is the complete, production-grade interface contract to be implemented in `src/engine/hitbox.js`.

### 8.1 Exported Constants

```javascript
/**
 * Mathematical and geometric constants for the 2.5D hitbox system.
 */
export const HITBOX_CONSTANTS = Object.freeze({
    /** Default weapon reach in meters (Ashen Longsword) */
    DEFAULT_WEAPON_REACH: 2.4,
    /** Default weapon vertical height in meters */
    DEFAULT_SWING_HEIGHT: 1.8,
    /** Default vertical center offset above feet in meters */
    DEFAULT_SWING_Y_OFFSET: 0.9,
    /** Default rear coverage margin in meters */
    DEFAULT_SWING_REAR_OFFSET: 0.2,

    /** Stygian Lance piercing beam maximum range in meters */
    STYGIAN_LANCE_RANGE: 16.0,
    /** Stygian Lance piercing beam vertical thickness in meters */
    STYGIAN_LANCE_THICKNESS: 1.0,
    /** Stygian Lance beam launch height above feet in meters */
    STYGIAN_LANCE_Y_OFFSET: 1.2,

    /** Standard knockback impulse force in m/s */
    DEFAULT_KNOCKBACK_FORCE: 6.0,
    /** Vertical knockback pop multiplier */
    KNOCKBACK_VERTICAL_POP_RATIO: 0.3,

    /** Maximum allowed depth offset from Z=0 in meters */
    PLANE_DEPTH_TOLERANCE: 0.5,
    /** Numerical epsilon for floating point comparison */
    EPSILON: 1e-5
});
```

### 8.2 Function Specifications & Signatures

#### `createAABB(minX, minY, maxX, maxY, minZ, maxZ)`
Constructs and normalizes an AABB object, ensuring $min \le max$.
```javascript
/**
 * Creates and normalizes a 2.5D Axis-Aligned Bounding Box.
 * Automatically orders coordinates such that min <= max.
 * 
 * @param {number} minX - First X boundary
 * @param {number} minY - First Y boundary
 * @param {number} maxX - Second X boundary
 * @param {number} maxY - Second Y boundary
 * @param {number} [minZ=-0.5] - Minimum Z boundary
 * @param {number} [maxZ=0.5]  - Maximum Z boundary
 * @returns {AABB} Normalized bounding box
 */
export function createAABB(minX, minY, maxX, maxY, minZ = -0.5, maxZ = 0.5);
```

#### `createAABBFromCenter(cx, cy, halfWidth, halfHeight, cz = 0, halfDepth = 0.5)`
Constructs an AABB from center point and extents.
```javascript
/**
 * Constructs an AABB from center coordinates and half-extents.
 * 
 * @param {number} cx - Center X coordinate
 * @param {number} cy - Center Y coordinate
 * @param {number} halfWidth - Half-width along X axis (meters)
 * @param {number} halfHeight - Half-height along Y axis (meters)
 * @param {number} [cz=0] - Center Z coordinate (meters)
 * @param {number} [halfDepth=0.5] - Half-depth along Z axis (meters)
 * @returns {AABB}
 */
export function createAABBFromCenter(cx, cy, halfWidth, halfHeight, cz = 0, halfDepth = 0.5);
```

#### `check2DOverlap(boxA, boxB, inclusive = true)`
Performs the 2.5D intersection test between two bounding boxes.
```javascript
/**
 * Evaluates whether two 2.5D AABBs intersect on the (X, Y) plane
 * while confirming depth alignment on Z=0.
 * 
 * @param {AABB} boxA - First bounding box
 * @param {AABB} boxB - Second bounding box
 * @param {boolean} [inclusive=true] - If true, touching boundary edges count as overlapping
 * @returns {boolean} True if boxes intersect; false otherwise
 */
export function check2DOverlap(boxA, boxB, inclusive = true);
```

#### `computeSwingHitbox(attackerPos, facing, options = {})`
Generates the active attack swing AABB in world coordinates.
```javascript
/**
 * @typedef {Object} SwingOptions
 * @property {number} [reach=2.4] - Weapon horizontal reach (meters)
 * @property {number} [height=1.8] - Weapon vertical swing height (meters)
 * @property {number} [yOffset=0.9] - Vertical center offset from attacker base (meters)
 * @property {number} [rearOffset=0.2] - Rear coverage padding behind attacker (meters)
 * @property {number} [depthTolerance=0.5] - Z-plane half-thickness (meters)
 */

/**
 * Computes the 2.5D bounding box for an active melee weapon swing.
 * 
 * @param {{ x: number, y: number, z?: number }} attackerPos - Attacker base coordinates
 * @param {number} facing - Facing direction (+1 for Right, -1 for Left)
 * @param {SwingOptions} [options={}] - Custom dimensions
 * @returns {AABB} World-space active attack hitbox
 */
export function computeSwingHitbox(attackerPos, facing, options = {});
```

#### `createBeamAABB(origin, facing, length = 16.0, thickness = 1.0, depthTolerance = 0.5)`
Constructs the bounding volume for the Stygian Lance railgun beam.
```javascript
/**
 * Computes the bounding volume for a piercing linear beam (e.g. Stygian Lance).
 * 
 * @param {{ x: number, y: number, z?: number }} origin - Beam launch origin (meters)
 * @param {number} facing - Facing direction (+1 for Right, -1 for Left)
 * @param {number} [length=16.0] - Beam reach distance along X (meters)
 * @param {number} [thickness=1.0] - Beam vertical thickness along Y (meters)
 * @param {number} [depthTolerance=0.5] - Depth bound on Z (meters)
 * @returns {AABB} World-space piercing beam bounding box
 */
export function createBeamAABB(origin, facing, length = 16.0, thickness = 1.0, depthTolerance = 0.5);
```

#### `checkRayAABBOverlap(rayOrigin, rayDir, maxDistance, box)`
Performs 2D slab-method line segment intersection against an AABB.
```javascript
/**
 * @typedef {Object} RayHitResult
 * @property {boolean} hit - Whether ray intersected box within maxDistance
 * @property {number} distance - Distance from origin to first contact point (meters)
 * @property {{ x: number, y: number, z: number }} point - Exact intersection coordinate
 */

/**
 * Calculates intersection between a directed ray segment and a 2.5D AABB using the Slab Method.
 * 
 * @param {{ x: number, y: number, z?: number }} rayOrigin - Ray start position
 * @param {{ x: number, y: number, z?: number }} rayDir - Ray direction vector (should be normalized)
 * @param {number} maxDistance - Maximum ray travel distance (meters)
 * @param {AABB} box - Target bounding box
 * @returns {RayHitResult}
 */
export function checkRayAABBOverlap(rayOrigin, rayDir, maxDistance, box);
```

#### `calculateKnockback(attackerPos, targetPos, force = 6.0, attackerFacing = 1, resistance = 0)`
Calculates the 2.5D directional knockback impulse vector.
```javascript
/**
 * Calculates the directional knockback impulse vector applied to a struck target.
 * 
 * @param {{ x: number, y: number, z?: number }} attackerPos - Attacker position
 * @param {{ x: number, y: number, z?: number }} targetPos - Target position
 * @param {number} [force=6.0] - Knockback velocity scalar (m/s)
 * @param {number} [attackerFacing=1] - Fallback facing direction if positions coincide (+1 or -1)
 * @param {number} [resistance=0] - Target knockback dampening factor [0..1]
 * @returns {{ vx: number, vy: number, vz: number }} Instantaneous knockback velocity
 */
export function calculateKnockback(attackerPos, targetPos, force = 6.0, attackerFacing = 1, resistance = 0);
```

#### `HitTracker` Class
```javascript
/**
 * Tracks entities hit during an attack swing to prevent duplicate damage registration.
 */
export class HitTracker {
    constructor() {
        /** @type {Set<string | number>} */
        this._hits = new Set();
        /** @type {string | number | null} */
        this._activeSwingId = null;
    }

    /**
     * Checks if a target has already been hit during the current tracking cycle.
     * @param {string | number} targetId
     * @returns {boolean}
     */
    hasHit(targetId) {
        return this._hits.has(targetId);
    }

    /**
     * Registers a target hit. Returns true if newly registered, false if already hit.
     * @param {string | number} targetId
     * @returns {boolean}
     */
    registerHit(targetId) {
        if (this._hits.has(targetId)) return false;
        this._hits.add(targetId);
        return true;
    }

    /**
     * Clears all recorded hits. Call at the start of a new swing.
     */
    reset() {
        this._hits.clear();
        this._activeSwingId = null;
    }

    /**
     * Context-aware tracking: auto-resets if swingId changes.
     * @param {string | number} swingId
     * @param {string | number} targetId
     * @returns {boolean}
     */
    track(swingId, targetId) {
        if (this._activeSwingId !== swingId) {
            this._hits.clear();
            this._activeSwingId = swingId;
        }
        return this.registerHit(targetId);
    }

    /**
     * Returns total number of unique targets struck.
     * @returns {number}
     */
    get count() {
        return this._hits.size;
    }
}
```

---

## 9. Comprehensive Numerical Test Vectors & Verification Benchmarks

Every mathematical formula has been pre-computed with exact decimal arithmetic. The builder implementing `tests/unit/hitbox.test.js` should verify these exact cases.

### Test Vector Suite 1: 2D AABB Overlap (`check2DOverlap`)

| Case ID | Box A $[x_{\min}, x_{\max}] \times [y_{\min}, y_{\max}]$ | Box B $[x_{\min}, x_{\max}] \times [y_{\min}, y_{\max}]$ | Expected Inclusive | Expected Strict | Rationale |
|:---|:---:|:---:|:---:|:---:|:---|
| **TV-1.1** | $[0, 4] \times [0, 2]$ | $[3, 6] \times [1, 3]$ | `true` | `true` | Overlap region $[3, 4] \times [1, 2]$ (Area = $1.0\text{ m}^2$) |
| **TV-1.2** | $[0, 2] \times [0, 2]$ | $[3, 5] \times [0, 2]$ | `false` | `false` | Disjoint on X ($x_{\max, A} = 2 < 3 = x_{\min, B}$) |
| **TV-1.3** | $[0, 2] \times [0, 2]$ | $[0, 2] \times [3, 5]$ | `false` | `false` | Disjoint on Y ($y_{\max, A} = 2 < 3 = y_{\min, B}$) |
| **TV-1.4** | $[0, 3] \times [0, 2]$ | $[3, 6] \times [0, 2]$ | `true` | `false` | Touching on boundary $x = 3$. Inclusive `true`, Strict `false` |
| **TV-1.5** | $[1, 5] \times [1, 5]$ | $[2, 4] \times [2, 4]$ | `true` | `true` | Complete containment of Box B inside Box A |
| **TV-1.6** | $[0, 4] \times [0, 2]$ ($z \in [-0.2, 0.2]$) | $[2, 5] \times [1, 3]$ ($z \in [2.0, 3.0]$) | `false` | `false` | (X, Y) overlaps, but Z depth disjoint ($0.2 < 2.0$) |

### Test Vector Suite 2: Prototype Vulnerability Verification (Elevation & Vertical Miss)
Demonstrates that the new math rejects the three prototype false-positive bugs.

- **Attacker**: Kaelen at base $(0.0, 0.0)$, facing right ($+1$).
  Active swing hitbox: $X \in [0.0 - 0.2, 0.0 + 2.4] = [-0.2, 2.4]$, $Y \in [0.0 + 0.9 - 0.9, 0.0 + 0.9 + 0.9] = [0.0, 1.8]$.
- **Target 1 (Grounded Enemy)**: Base $(2.0, 0.0)$, hurtbox $X \in [1.6, 2.4]$, $Y \in [0.0, 1.8]$.
  - $X \cap: [-0.2, 2.4] \cap [1.6, 2.4] = [1.6, 2.4] \neq \emptyset$
  - $Y \cap: [0.0, 1.8] \cap [0.0, 1.8] = [0.0, 1.8] \neq \emptyset$
  - **Verdict: HIT (`true`)**
- **Target 2 (Elevated Platform Enemy - Prototype Bug)**: Base $(2.0, 4.0)$, hurtbox $X \in [1.6, 2.4]$, $Y \in [4.0, 5.8]$.
  - Prototype 1D Check: $|0.0 - 2.0| = 2.0 < 2.4 \land \text{inFront} \implies \textbf{FALSE HIT!}$
  - 2.5D AABB Check: $Y \cap: [0.0, 1.8] \cap [4.0, 5.8] = \emptyset$ ($1.8 < 4.0$).
  - **Verdict: MISS (`false`)** (Correctly avoids false hit).
- **Target 3 (Player Jumping Apex - Prototype Bug)**: Player jumps to apex $y = 2.4\text{ m}$. Swing bounds $Y \in [2.4, 4.2]$.
  - Grounded Enemy Hurtbox: $Y \in [0.0, 1.8]$.
  - Prototype 1D Check: Distance along X still $< 2.4 \implies \textbf{FALSE HIT!}$
  - 2.5D AABB Check: $Y \cap: [2.4, 4.2] \cap [0.0, 1.8] = \emptyset$ ($1.8 < 2.4$).
  - **Verdict: MISS (`false`)** (Correctly misses low enemy when high).

### Test Vector Suite 3: Attack Swing Hitbox Bounds (`computeSwingHitbox`)

- **Setup A (Facing Right $+1$)**:
  - Attacker base: $(10.0, 2.0)$
  - Parameters: $R_x = 2.4$, $H_y = 1.8$, $Y_{\text{off}} = 0.9$, $B_x = 0.2$
  - Calculation:
    - $x_{\min} = 10.0 - 0.2 = \mathbf{9.8}$
    - $x_{\max} = 10.0 + 2.4 = \mathbf{12.4}$
    - $y_{\min} = 2.0 + 0.9 - 0.9 = \mathbf{2.0}$
    - $y_{\max} = 2.0 + 0.9 + 0.9 = \mathbf{3.8}$
    - $z_{\min} = \mathbf{-0.5}, \; z_{\max} = \mathbf{0.5}$
  - Output AABB: `[9.8, 12.4] x [2.0, 3.8]`

- **Setup B (Facing Left $-1$)**:
  - Attacker base: $(10.0, 2.0)$
  - Parameters: $R_x = 2.4$, $H_y = 1.8$, $Y_{\text{off}} = 0.9$, $B_x = 0.2$
  - Calculation:
    - $x_{\min} = 10.0 - 2.4 = \mathbf{7.6}$
    - $x_{\max} = 10.0 + 0.2 = \mathbf{10.2}$
    - $y_{\min} = 2.0 + 0.9 - 0.9 = \mathbf{2.0}$
    - $y_{\max} = 2.0 + 0.9 + 0.9 = \mathbf{3.8}$
  - Output AABB: `[7.6, 10.2] x [2.0, 3.8]`

### Test Vector Suite 4: Stygian Lance Piercing Beam AABB (`createBeamAABB`)

- Attacker position: $(5.0, 1.0)$
- Origin: $(5.0, 1.0 + 1.2) = (5.0, 2.2)$
- Facing: $+1$, Length: $16.0$, Thickness: $1.0$
- Calculation:
  - $x_{\min} = \mathbf{5.0}$
  - $x_{\max} = 5.0 + 16.0 = \mathbf{21.0}$
  - $y_{\min} = 2.2 - 0.5 = \mathbf{1.7}$
  - $y_{\max} = 2.2 + 0.5 = \mathbf{2.7}$
- Test Target A (In line): Hurtbox $[14.0, 14.8] \times [1.5, 3.0] \implies \textbf{HIT}$
- Test Target B (Behind): Hurtbox $[2.0, 2.8] \times [1.5, 3.0] \implies \textbf{MISS}$ ($x_{\max} = 2.8 < 5.0$)
- Test Target C (Out of range): Hurtbox $[22.0, 22.8] \times [1.5, 3.0] \implies \textbf{MISS}$ ($x_{\min} = 22.0 > 21.0$)
- Test Target D (Above beam): Hurtbox $[10.0, 10.8] \times [3.5, 5.0] \implies \textbf{MISS}$ ($y_{\min} = 3.5 > 2.7$)

### Test Vector Suite 5: Raycast Slab Method (`checkRayAABBOverlap`)

- Ray Origin: $(0.0, 1.5)$, Direction: $(1.0, 0.0)$, Max Distance: $20.0$
- Box: $[8.0, 10.0] \times [0.0, 2.0]$
  - X slabs:
    - $t_{x1} = (8.0 - 0.0) / 1.0 = 8.0$
    - $t_{x2} = (10.0 - 0.0) / 1.0 = 10.0$
    - $t_{x,\min} = 8.0, \; t_{x,\max} = 10.0$
  - Y slabs ($D_y = 0$, $O_y = 1.5 \in [0.0, 2.0]$):
    - $t_{y,\min} = -\infty, \; t_{y,\max} = +\infty$
  - Composite:
    - $t_{\text{enter}} = \max(8.0, -\infty) = \mathbf{8.0}$
    - $t_{\text{exit}} = \min(10.0, +\infty) = \mathbf{10.0}$
  - Evaluation: $8.0 \le 10.0 \land 10.0 \ge 0 \land 8.0 \le 20.0 \implies \mathbf{HIT = true}$
  - Hit Point: $(0.0 + 8.0 \times 1.0, 1.5 + 8.0 \times 0.0) = \mathbf{(8.0, 1.5, 0.0)}$

### Test Vector Suite 6: Directional Knockback (`calculateKnockback`)

| Case ID | Attacker Pos $(x, y)$ | Target Pos $(x, y)$ | Force | Facing | Resistance | Expected $v_x$ | Expected $v_y$ | Expected $v_z$ | Rationale |
|:---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---|
| **TV-6.1** | $(0.0, 0.0)$ | $(3.0, 0.0)$ | $6.0$ | $+1$ | $0.0$ | $\mathbf{+6.0}$ | $\mathbf{+1.8}$ | $\mathbf{0.0}$ | Normal hit to right ($\Delta x = +3.0$) |
| **TV-6.2** | $(5.0, 0.0)$ | $(2.0, 0.0)$ | $6.0$ | $-1$ | $0.0$ | $\mathbf{-6.0}$ | $\mathbf{+1.8}$ | $\mathbf{0.0}$ | Normal hit to left ($\Delta x = -3.0$) |
| **TV-6.3** | $(4.0, 1.0)$ | $(4.0, 1.0)$ | $6.0$ | $+1$ | $0.0$ | $\mathbf{+6.0}$ | $\mathbf{+1.8}$ | $\mathbf{0.0}$ | Coincident ($\Delta x = 0$), fallback to facing $+1$ |
| **TV-6.4** | $(4.0, 1.0)$ | $(4.0, 1.0)$ | $6.0$ | $-1$ | $0.0$ | $\mathbf{-6.0}$ | $\mathbf{+1.8}$ | $\mathbf{0.0}$ | Coincident ($\Delta x = 0$), fallback to facing $-1$ |
| **TV-6.5** | $(0.0, 0.0)$ | $(3.0, 0.0)$ | $6.0$ | $+1$ | $0.4$ | $\mathbf{+3.6}$ | $\mathbf{+1.08}$ | $\mathbf{0.0}$ | Dampened: $6.0 \times (1 - 0.4) = 3.6$, $1.8 \times 0.6 = 1.08$ |
| **TV-6.6** | $(0.0, 0.0)$ | $(3.0, 0.0)$ | $6.0$ | $+1$ | $1.0$ | $\mathbf{0.0}$ | $\mathbf{0.0}$ | $\mathbf{0.0}$ | Complete immunity (Boss hyper-armor) |

### Test Vector Suite 7: Duplicate Hit Suppression (`HitTracker`)

1. Initialize `tracker = new HitTracker()`
2. Entity `dummy_1` enters hitbox on frame 1:
   - `tracker.hasHit("dummy_1")` $\implies \mathbf{false}$
   - `tracker.registerHit("dummy_1")` $\implies \mathbf{true}$ (Damage dealt)
3. Entity `dummy_1` remains inside hitbox on frame 2:
   - `tracker.hasHit("dummy_1")` $\implies \mathbf{true}$
   - `tracker.registerHit("dummy_1")` $\implies \mathbf{false}$ (Damage suppressed!)
4. Entity `dummy_2` enters hitbox on frame 2:
   - `tracker.registerHit("dummy_2")` $\implies \mathbf{true}$ (Damage dealt to second target)
   - `tracker.count` $\implies \mathbf{2}$
5. Swing ends, next swing begins $\implies$ call `tracker.reset()`:
   - `tracker.hasHit("dummy_1")` $\implies \mathbf{false}$
   - `tracker.registerHit("dummy_1")` $\implies \mathbf{true}$ (Target can now be hit by next swing)

---

## 10. Implementation Guidelines & Edge-Case Guardrails for Builders

When writing `src/engine/hitbox.js`, the builder agent must adhere to the following guardrails:

### Guardrail 1: Robust Coordinate Inversion Normalization
Callers may occasionally supply inverted bounds (e.g. $x_1 > x_2$). `createAABB` must enforce:
```javascript
const actualMinX = Math.min(minX, maxX);
const actualMaxX = Math.max(minX, maxX);
```
Never trust that callers provide min before max.

### Guardrail 2: NaN and Non-Finite Sanitization
All coordinate, force, and facing inputs must be checked for `Number.isFinite()`. If `NaN` or `Infinity` is detected:
- Coordinates: fallback to `0.0`.
- Facing: fallback to `+1`.
- Force: fallback to `0.0`.
- Resistance: clamp to $[0.0, 1.0]$.

### Guardrail 3: Zero-Allocation Fast Paths
In 60 FPS WebGL game loops, allocating objects inside `check2DOverlap` produces garbage collection pauses.
- `check2DOverlap` accepts pure numbers or pre-allocated AABB objects.
- Do not construct temporary objects or arrays inside collision loop iterations.

### Guardrail 4: Coincident Center Edge Case
In `calculateKnockback`, always handle `Math.abs(targetPos.x - attackerPos.x) < 1e-5` explicitly by checking `attackerFacing`. Never let `Math.sign(0)` produce `0` horizontal velocity.

### Guardrail 5: Depth Alignment ($Z=0$) Safety
Always enforce that depth overlap $|z_A - z_B| \le \text{depthTolerance}$ passes before evaluating (X, Y) collisions to protect against 3D camera/particle artifacts.

---
*Report completed and verified against all game documents, Unity C# reference scripts, and the Three.js prototype.*
