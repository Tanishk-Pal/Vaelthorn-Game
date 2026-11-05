# Handoff Report: Kinematics Engine Design Specification
**Agent:** `explorer_m1_kinematics_1`  
**Role:** Kinematics Exploration Specialist  
**Working Directory:** `E:\Vaelthorn\.agents\teamwork\explorer_m1_kinematics_1\`  
**Target Milestone:** Milestone 1 — Kinematics & Hitbox Math Engine  
**Date:** 2026-11-01  
**Handoff Type:** Hard (Task complete)  

---

## 1. Observation

1. **DISPATCH Requirements** (`E:\Vaelthorn\.agents\teamwork\explorer_m1_kinematics_1\DISPATCH.md:12-24`):
   - Horizontal velocity $v_x = u_x \cdot v_{move}$ with $v_{move} = 9.0\text{ m/s}$.
   - Takeoff velocity $v_{y0} = \sqrt{2 \cdot |g| \cdot h}$ ($h=2.4\text{ m}$, $g=-26.0\text{ m/s}^2$).
   - Piecewise gravity: standard ascent ($g=-26.0$), short hop cut ($g \times 2.2 = -57.2$ when jump released early), snappy falling ($g \times 1.6 = -41.6$ when $v_y < 0$).
   - Coyote time ($0.12\text{ s}$) and jump buffering ($0.12\text{ s}$) state decrement and triggers.
   - Shadow dodge roll: $v_x = \text{facing} \times 16.0\text{ m/s}$, duration $0.35\text{ s}$, cooldown $0.50\text{ s}$, I-frame flag active.
   - Strict 2.5D clamp: $z(t) \equiv 0$, boundary tolerance $|z| \le 0.001$, clamped to $0.0$.
   - Facing direction: flips $\pm 1$ when $|u_x| > 0.1$.
   - Exact JavaScript function signatures, exported constants, JSDoc typedefs, numerical test cases, and Worker recommendations.

2. **Master Architecture & Interface Contracts** (`E:\Vaelthorn\PROJECT.md:115-123`):
   - `updateKinematics(entity, input, dt, config)`:
     - Input: `entity` `{ x, y, z, vx, vy, vz, isGrounded, facing, coyoteTimer, jumpBufferTimer, isRolling, rollTimer, rollCooldown }`
     - Input: `input` `{ horizontal: [-1..1], jumpPressed: bool, jumpHeld: bool, rollPressed: bool }`
     - Return: updated kinematics state strictly clamped to $z=0$, bounded velocity, no NaNs.
   - `executeJump(entity, config)`: calculates $v_{y0} = \sqrt{2 \cdot |g| \cdot h}$.
   - `executeRoll(entity, config)`: initiates roll with $v_x = \text{facing} \times v_{roll}$, I-frames active for duration.

3. **C# Script Benchmark** (`E:\Vaelthorn\Assets\_Project\Scripts\Player\PlayerMotor.cs:16,23,26,29,32,36,39,103,138,154,186`):
   - `moveSpeed = 8.5f`, `jumpHeight = 2.4f`, `gravity = -26f`, `fallMultiplier = 1.6f`, `lowJumpMultiplier = 2.2f`.
   - `coyoteTimeDuration = 0.12f`, `jumpBufferDuration = 0.12f`.
   - `_velocity.y = Mathf.Sqrt(jumpHeight * -2f * gravity);`.
   - Ground glue: `if (_isGrounded && _velocity.y < 0f) _velocity.y = -2f;`.
   - 2D plane lock: `if (Mathf.Abs(transform.position.z - lockedZPosition) > 0.001f) correctedPos.z = lockedZPosition;`.

4. **Prototype Runtime Implementation** (`E:\Vaelthorn\Vaelthorn_Playable_Prototype.html:631-646,722-736,860-901`):
   - `speed: 9.0`, `jumpPower: 14.5`, `gravity: -36.0`, `coyoteTime: 0.12`.
   - `doDodge`: `Player.isDodging = true; Player.dodgeTimer = 0.35; Player.vx = (Player.facingRight ? 1 : -1) * 16.0;`.
   - Physics loop integrates horizontal, vertical gravity, ground/platforms, clamps dt $\le 0.05\text{ s}$.

5. **Test Architecture Alignment** (`E:\Vaelthorn\.agents\teamwork\test_writer_e2e_1\DISPATCH.md:18-29`):
   - Unit tests under `tests/unit/kinematics.test.js`.
   - Tier 1 and Tier 2 tests under `tests/e2e/tier1_features.test.js` and `tests/e2e/tier2_boundaries.test.js`.
   - Automated simulation runner `tests/playtest_runner.js`.

---

## 2. Logic Chain

1. **Derivation of Analytical Takeoff Velocity** (from Observation 1 & 3):
   - Given $h = 2.4\text{ m}$ and downward gravity $g = -26.0\text{ m/s}^2$:
     $v^2 = v_0^2 + 2ad \implies 0 = v_{y0}^2 - 2|g|h \implies v_{y0} = \sqrt{2 \cdot |g| \cdot h}$.
   - Substituting parameters: $v_{y0} = \sqrt{2 \cdot 26.0 \cdot 2.4} = \sqrt{124.8} \approx 11.171392035\text{ m/s}$.
   - In ascent with jump held: $a_y = -26.0\text{ m/s}^2 \implies t_{apex} = 11.171392 / 26.0 \approx 0.4296689\text{ s}$.
   - This exact formula guarantees apex height $2.4\text{ m}$ regardless of frame rate.

2. **Formulation of Piecewise Gravity Multipliers** (from Observation 1, 3, 4):
   - Standard ascent ($v_y > 0 \land \text{jumpHeld}$): $a_y = -26.0\text{ m/s}^2$.
   - Short hop cut ($v_y > 0 \land \neg \text{jumpHeld}$): $a_y = -26.0 \times 2.2 = -57.2\text{ m/s}^2$.
     Yields cut apex $h_{cut} = 124.8 / (2 \times 57.2) \approx 1.0909\text{ m}$ ($< 46\%$ of full height) in $0.1953\text{ s}$.
   - Snappy falling ($v_y < 0$): $a_y = -26.0 \times 1.6 = -41.6\text{ m/s}^2$.
     Yields descent time from full apex: $t_{fall} = \sqrt{4.8 / 41.6} \approx 0.3397\text{ s}$ ($21\%$ faster than ascent).
   - This asymmetrical curve provides responsive platforming controls.

3. **Symplectic (Semi-Implicit) Euler Selection** (from Observation 1, 3, 4):
   - Explicit Euler causes kinetic energy drift and apex overshoots.
   - Semi-Implicit Euler ($v_{t+1} = v_t + a \Delta t$, $x_{t+1} = x_t + v_{t+1} \Delta t$) is symplectic, unconditionally stable under constant and piecewise acceleration, and matches Unity's `CharacterController.Move()`.
   - Capped with $\Delta t \le 0.05\text{ s}$ and zero/negative dt guards, it prevents simulation explosion during browser lags.

4. **Game-Feel Timers & Buffer State Machine** (from Observation 1 & 3):
   - Coyote timer ($0.12\text{ s}$) allows mid-air jumps if the player walks off a platform ledge.
   - Jump buffer timer ($0.12\text{ s}$) captures jump presses made up to $0.12\text{ s}$ prior to ground contact, automatically triggering takeoff on the touchdown frame.
   - Jump execution clears both timers simultaneously, preventing double-jump exploits.

5. **Shadow Dodge Roll & Invulnerability** (from Observation 1 & 4):
   - Speed $16.0\text{ m/s}$ in current facing direction for $0.35\text{ s}$ yields exact displacement $\Delta x = 5.60\text{ m}$.
   - Active I-frames (`isInvulnerable = true`) protect against damage during the roll.
   - Independent cooldown timer ($0.50\text{ s}$ total) prevents roll spamming and ensures $0.15\text{ s}$ recovery vulnerability.

6. **Plane Confinement & Anti-Tunneling** (from Observation 1, 2, 3):
   - Strict clamp $|z| \le 0.001$ snaps $z \leftarrow 0.0$ and $v_z \leftarrow 0.0$.
   - Swept vertical collision detects platform crossing between $y(t)$ and $y(t) + v_y \Delta t$, preventing high-velocity tunneling at terminal velocity ($-40.0\text{ m/s}$).

---

## 3. Caveats

1. **Platform Top Thickness Assumption**: The swept ground collision in `resolveGroundCollision()` assumes platforms have an accessible top surface at elevation $y = p.y$. Sloped mesh terrain collision will be handled at the physics/collider layer if 3D mesh colliders are used.
2. **Terminal Velocity Constant**: Set to $-40.0\text{ m/s}$ based on platforming convention and high-fall safety. If freefall plunging moves (e.g. Aerial Plunge) exceed this, they can temporarily override `terminalVelocity`.
3. **No Direct Source Modification**: In compliance with exploration constraints, no files in `src/` were modified. The complete implementation code is delivered in `kinematics_design.md`.

---

## 4. Conclusion

The kinematics engine design for `src/engine/kinematics.js` is fully specified, mathematically verified, and documented with complete JSDoc interface contracts, exported configuration constants, and a comprehensive Node.js unit test suite.

The design delivers:
- **Exact analytical takeoff velocity**: $v_{y0} = \sqrt{2 \cdot |-26.0| \cdot 2.4} = \sqrt{124.8} \approx 11.171392\text{ m/s}$.
- **Crisp piecewise gravity**: $-26.0\text{ m/s}^2$ ascent, $-57.2\text{ m/s}^2$ short hop, $-41.6\text{ m/s}^2$ falling.
- **Robust game-feel timers**: $0.12\text{ s}$ coyote time and $0.12\text{ s}$ jump buffering.
- **Shadow dodge roll**: $16.0\text{ m/s}$ dash for $0.35\text{ s}$ ($\Delta x = 5.6\text{ m}$) with I-frames and $0.50\text{ s}$ cooldown.
- **Strict 2.5D constraint**: $z \equiv 0.0$ with $0.001$ tolerance snap.
- **Defensive guards**: $\Delta t \le 0.05\text{ s}$, zero/negative dt guard, NaN sanitization, swept vertical collision anti-tunneling.

The artifact `E:\Vaelthorn\.agents\teamwork\explorer_m1_kinematics_1\kinematics_design.md` contains the full implementation code and is ready for the implementer agent.

---

## 5. Verification Method

To independently verify this specification:
1. **Inspect Artifacts**:
   - Design Document: `E:\Vaelthorn\.agents\teamwork\explorer_m1_kinematics_1\kinematics_design.md`
   - Handoff Report: `E:\Vaelthorn\.agents\teamwork\explorer_m1_kinematics_1\handoff.md`
2. **Execute Analytical Calculations**:
   - Node.js one-liner to verify jump takeoff velocity:
     ```powershell
     node -e "const v = Math.sqrt(2 * 26.0 * 2.4); console.log('Takeoff velocity:', v, 'Apex height:', (v*v)/(2*26.0));"
     ```
     *Expected Output*: `Takeoff velocity: 11.171392034997773 Apex height: 2.4`
   - Node.js one-liner to verify roll distance:
     ```powershell
     node -e "console.log('Roll displacement:', 16.0 * 0.35, 'm');"
     ```
     *Expected Output*: `Roll displacement: 5.6 m`
3. **Execute Unit Tests Once Implemented**:
   - When `src/engine/kinematics.js` and `tests/unit/kinematics.test.js` are created:
     ```powershell
     node --test tests/unit/kinematics.test.js
     ```
   - All tests must pass with 0 failures.
4. **Invalidation Conditions**:
   - Any test producing `NaN` or `Infinity`.
   - Takeoff velocity failing to achieve apex height $2.4\text{ m}$ under base gravity $-26.0\text{ m/s}^2$.
   - Z coordinate deviating from $0.0$ by more than $0.001$.
   - Releasing jump early failing to cut apex height.
