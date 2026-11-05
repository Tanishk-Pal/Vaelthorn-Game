# Handoff Report: Hitbox & Collision Math Engine (`src/engine/hitbox.js`)
**Author:** `explorer_m1_hitbox_2` (Hitbox Exploration Specialist)  
**Date:** 2026-11-01  
**Target Module:** `src/engine/hitbox.js`  
**Working Directory:** `E:\Vaelthorn\.agents\teamwork\explorer_m1_hitbox_2\`  
**Design Document:** `E:\Vaelthorn\.agents\teamwork\explorer_m1_hitbox_2\hitbox_design.md`

---

## 1. Observation

1. **Playable Prototype Hitbox Flaw**:
   - Inspected `E:\Vaelthorn\Vaelthorn_Playable_Prototype.html` lines 759-765:
     ```javascript
     const dist = Math.abs(Player.x - dummyGroup.position.x);
     const inFront = Player.facingRight 
         ? (dummyGroup.position.x > Player.x) 
         : (dummyGroup.position.x < Player.x);

     if (dist < 2.4 && inFront) {
     ```
   - Observed that collision was reduced strictly to a 1D horizontal check without ANY vertical ($Y$) bounding or height filtering. An enemy 10 meters above or below the player will register damage as long as $|x_{\text{player}} - x_{\text{target}}| < 2.4$.
   - Inspected `E:\Vaelthorn\Vaelthorn_Playable_Prototype.html` lines 817-822:
     ```javascript
     const dist = Math.abs(Player.x - dummyGroup.position.x);
     const inFront = Player.facingRight 
         ? (dummyGroup.position.x > Player.x) 
         : (dummyGroup.position.x < Player.x);

     if (inFront && dist < 16) {
     ```
   - Stygian Lance spell had zero beam thickness or vertical bounding ($Y$ coordinate ignored entirely).

2. **Prototype Knockback Simplification**:
   - Inspected `E:\Vaelthorn\Vaelthorn_Playable_Prototype.html` line 775:
     ```javascript
     dummyGroup.position.x += (Player.facingRight ? 0.35 : -0.35);
     ```
   - Directly teleports position by $0.35\text{ m}$ without velocity integration, without upward pop ($v_y = 0.3 \cdot \text{force}$), without Z-plane safety, and without knockback resistance dampening.

3. **C# Reference Implementation Observations**:
   - `E:\Vaelthorn\Assets\_Project\Scripts\Combat\DamageDealer.cs` lines 25, 43-64, 73-76:
     ```csharp
     private readonly HashSet<Collider> _hitObjectsThisSwing = new HashSet<Collider>();
     public void EnableHitbox() { _hitObjectsThisSwing.Clear(); _canDealDamage = true; ... }
     public void DisableHitbox() { _canDealDamage = false; _hitObjectsThisSwing.Clear(); ... }
     if (_hitObjectsThisSwing.Contains(other)) return;
     _hitObjectsThisSwing.Add(other);
     ```
     Observed that single-hit suppression per swing is required to prevent multiple damages over continuous active frames.
   - `E:\Vaelthorn\Assets\_Project\Scripts\Combat\DamageReceiver.cs` lines 29-33:
     ```csharp
     Vector3 knockbackDir = (transform.position - hitSourcePosition).normalized;
     knockbackDir.z = 0f; // strictly keep knockback along X and Y
     knockbackDir.y = 0.3f; // slight upward pop
     ```
     Observed explicit $Z = 0$ constraint and $y = 0.3$ pop ratio.

4. **Geometry & Scale Observations**:
   - `E:\Vaelthorn\Docs\Phase3_Prototype_Guide.md` lines 101-105:
     `SwordHitbox` local position $(0.7, 0, 0)$, scale $(0.2, 0.8, 0.2)$.
   - `E:\Vaelthorn\Vaelthorn_Playable_Prototype.html` lines 530-575:
     Player torso height $0.9\text{ m}$, head at $y = 1.72\text{ m}$, total height $\approx 1.8-2.0\text{ m}$, blade length $1.2\text{ m}$, pivot at $(0.2, 1.1, 0)$.
   - `E:\Vaelthorn\.agents\teamwork\spec_miner_survey_1\spec_report.md` lines 157-160:
     $D_{\text{reach}} = 2.4\text{ m}$, $H_{\text{reach}} = 1.8\text{ m}$, $L_{\text{beam}} = 16.0\text{ m}$.

---

## 2. Logic Chain

1. **From 1D Distance Flaws to 2D AABB Formulation**:
   - Because the prototype ignored $Y$ elevation (Observation 1), jumping players and elevated enemies produce false hits.
   - Therefore, a true 2D AABB intersection test $([x_{\min, A}, x_{\max, A}] \cap [x_{\min, B}, x_{\max, B}] \neq \emptyset) \land ([y_{\min, A}, y_{\max, A}] \cap [y_{\min, B}, y_{\max, B}] \neq \emptyset)$ locked to $Z = 0$ is strictly required (`check2DOverlap`).

2. **From Weapon Physical Properties to Dynamic Swing Bounding Box**:
   - The sword pivot is at shoulder/chest height ($y \approx 1.1\text{ m}$), sweeps through an arc spanning $H_y = 1.8\text{ m}$, and extends horizontally $R_x = 2.4\text{ m}$ (Observations 1 & 4).
   - Therefore, `computeSwingHitbox(pos, facing)` must project $x \in [P_x - B_x, P_x + R_x]$ (for right) or $[P_x - R_x, P_x + B_x]$ (for left) with $y \in [P_y, P_y + 1.8\text{ m}]$ and a rear margin $B_x = 0.2\text{ m}$ to prevent point-blank misses.

3. **From Linear Stygian Lance Railgun to Beam AABB**:
   - The Stygian Lance is a straight horizontal piercing railgun spanning $16\text{ m}$ from player chest ($y = P_y + 1.2\text{ m}$) with a visual cylinder diameter of $0.24\text{ m}$ and gameplay thickness $\Delta y = 1.0\text{ m}$ (Observations 1 & 4).
   - Therefore, a piercing beam AABB spanning $[P_x, P_x + 16\cdot F]$ by $[P_y + 0.7, P_y + 1.7]$ accurately models multi-target piercing hits.

4. **From Multi-Frame Physics Loops to `HitTracker` State Machine**:
   - Attack active swing frames persist for $\approx 0.14\text{ s}$ ($\approx 8-9$ frames at 60fps). Without tracking, overlapping colliders damage targets every frame (Observation 3).
   - Therefore, an encapsulated `HitTracker` storing `Set<targetId>` with `hasHit(id)`, `registerHit(id)`, and `reset()` is mathematically mandatory.

5. **From Kinetic Impulses to Directional Knockback Velocity Vector**:
   - The prototype hard-coded displacement increments (Observation 2), whereas the C# script calculated directional impulses with $Z = 0$ and $Y = 0.3$ pop (Observation 3).
   - Therefore, `calculateKnockback(attackerPos, targetPos, force, attackerFacing, resistance)` must calculate:
     $$\Delta x = P_{\text{tgt}, x} - P_{\text{atk}, x}$$
     $$\text{dir}_x = \Delta x \neq 0 ? \text{sign}(\Delta x) : \text{attackerFacing}$$
     $$\vec{v} = \{ v_x: \text{dir}_x \cdot F \cdot (1 - R), \; v_y: 0.3 \cdot F \cdot (1 - R), \; v_z: 0.0 \}$$
     This handles coincident centers gracefully and ensures smooth physics integration.

---

## 3. Caveats

1. **Rotated Oriented Bounding Boxes (OBBs)**:
   - The design specifies Axis-Aligned Bounding Boxes (AABBs) for all melee strikes, beams, and entity hurtboxes. In a 2.5D side-scrolling plane, AABBs provide optimal performance and exact bounding for character capsules and rectangular sweeps. Full OBBs (Oriented Bounding Boxes) with rotating angles were evaluated but deemed unnecessary complexity and CPU overhead for 60fps WebGL execution.
2. **Depth ($Z$) Thickness in 2.5D**:
   - All gameplay entities are physically constrained to $Z = 0$. A lateral depth tolerance of $\pm 0.5\text{ m}$ is included in bounds definitions to accommodate minor visual mesh offsets or visual depth sorting without failing collision tests.
3. **No Direct Code Implementation**:
   - Per explorer role constraints, no source code was written in `src/engine/`. All algorithms, interface signatures, types, and constants are fully detailed in `hitbox_design.md` for immediate implementation by builder agents.

---

## 4. Conclusion

The mathematical models, coordinate conventions, and interface contracts for `src/engine/hitbox.js` are completely defined, verified, and documented in `E:\Vaelthorn\.agents\teamwork\explorer_m1_hitbox_2\hitbox_design.md`.

### Core Deliverables Ready for Implementation:
- `HITBOX_CONSTANTS`: Pre-configured geometric and gameplay constants.
- `createAABB(...)`: Normalized, inversion-safe 2.5D bounding box constructor.
- `createAABBFromCenter(...)`: Extent-based box constructor.
- `check2DOverlap(boxA, boxB, inclusive)`: Robust 2D AABB intersection with depth validation.
- `computeSwingHitbox(pos, facing, options)`: Dynamic attack volume computation.
- `createBeamAABB(origin, facing, length, thickness)`: Piercing beam volume generation.
- `checkRayAABBOverlap(origin, dir, maxDist, box)`: 2D slab-method ray-box intersection.
- `calculateKnockback(attackerPos, targetPos, force, facing, resistance)`: 2.5D velocity impulse vector with zero Z-drift and coincident center resolution.
- `HitTracker`: Zero-allocation duplicate hit suppression class.

---

## 5. Verification Method

To independently verify the mathematical formulations and implementation:

1. **Unit Test Execution**:
   Once `src/engine/hitbox.js` and `tests/unit/hitbox.test.js` are constructed, run:
   ```powershell
   node --test tests/unit/hitbox.test.js
   ```
2. **Test Vector Verification**:
   Inspect Section 9 of `hitbox_design.md` and confirm that all 7 test suites (TV-1.1 through TV-6.6, plus HitTracker and Prototype Bug suites) match the exact outputs:
   - TV-1.1: Overlap region $[3, 4] \times [1, 2]$ yields `true`.
   - TV-2 (Prototype Bug): Grounded attack ($Y \in [0, 1.8]$) against target at $y=4.0$ yields `false` (prototype yields `true`).
   - TV-3: Swing bounds for $F=-1$ yields $[7.6, 10.2] \times [2.0, 3.8]$.
   - TV-5: Raycast from $(0, 1.5)$ hits $[8, 10] \times [0, 2]$ at distance $8.0\text{ m}$.
   - TV-6.3: Coincident knockback ($\Delta x = 0$) with $F=+1$ yields $v_x = +6.0, v_y = +1.8, v_z = 0.0$.
   - TV-7: `HitTracker` returns `true` on frame 1, `false` on frame 2, and `true` after `.reset()`.
3. **Invalidation Conditions**:
   The design is invalidated if:
   - Floating-point `NaN` propagates when `force` or positions are non-finite.
   - Touching boundary faces ($x_{\max, A} = x_{\min, B}$) fail overlap when `inclusive = true`.
   - Coincident attacker and target positions produce $v_x = 0$ knockback.
   - Any knockback vector yields non-zero $v_z$.
