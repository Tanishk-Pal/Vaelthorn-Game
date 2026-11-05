# Comprehensive Unity C# Codebase & Toolchain Analysis: Vaelthorn

**Date:** 2026-11-01  
**Investigator:** `explorer_unity_survey_2` (Teamwork Explorer / Codebase Surveyor)  
**Target Project:** `E:\Vaelthorn`  
**Referenced Specs:** `Docs\GDD_Vaelthorn.md`, `Docs\Technical_Plan_Vaelthorn.md`, `Docs\Phase3_Prototype_Guide.md`, `ORIGINAL_REQUEST.md`

---

## 1. Executive Summary

1. **Unity Asset State**: The Unity directory `Assets\_Project\Scripts\` contains **10 standalone C# scripts** (~29.3 KB total) written as modular components for a 2.5D action RPG. However, the repository contains **no Unity project metadata**: there are no `.meta` files, no `ProjectSettings/` directory, no `Packages/manifest.json`, no `.csproj`/`.sln` solution files, and no `.unity` scene files. The subdirectories `Materials/`, `Prefabs/`, `Scenes/`, and `UI/` are completely empty.
2. **Environment & Toolchain Audit**: 
   - **Unity Editor & Unity Hub are NOT installed** anywhere on the Windows system.
   - **.NET SDK (`dotnet`) is NOT installed** (neither in PATH nor standard directories).
   - **Modern C# compiler (`csc`) is NOT available**; only legacy .NET Framework 4.8 `csc.exe` (supporting only up to C# 5) exists.
   - **`UnityEngine.dll` is NOT present** on the filesystem, making CLI compilation and headless test execution of these C# scripts mathematically impossible on this host without a full external Unity installation.
3. **Completeness vs. R1-R4**: The C# codebase covers ~20-25% of the design requirements. Basic 2.5D kinematics (`PlayerMotor`), a basic 3-hit combo (`PlayerCombat`), damage passing (`DamageDealer`/`DamageReceiver`/`Health`), hit-stop (`HitStopManager`), and a stationary auto-reviving punch bag (`TrainingDummy`) exist. **Completely missing** are: parry timing windows, shadow dodge roll mechanics, Stygian Resonance resource accumulation/drain, Stygian Lance spell, projectile kinematics, all AI state machines (patrol, aggro, pursuit, attack, defeat), elite/boss encounters, audio systems, and UI HUD.
4. **Primary Architecture Recommendation**: Under Requirement R1, the team must decide between expanding Unity or enhancing the standalone 3D WebGL build. Because Unity is absent from the host and cannot be built or run via CLI, **the standalone 3D WebGL/HTML5 prototype (`Vaelthorn_Playable_Prototype.html`) must be selected as the primary target architecture**. It runs immediately out-of-the-box on installed browsers (Chrome/Edge), has active 3D rendering and combat, and can be programmatically tested and verified via Node.js/Python without toolchain blockers.

---

## 2. File Layout & Asset Inventory

A recursive scan of `E:\Vaelthorn\Assets` reveals the exact layout:

```
E:\Vaelthorn\Assets\
└── _Project\
    ├── Materials\                       [EMPTY DIRECTORY - 0 files]
    ├── Prefabs\                         [EMPTY DIRECTORY - 0 files]
    ├── Scenes\                          [EMPTY DIRECTORY - 0 files]
    ├── UI\                              [EMPTY DIRECTORY - 0 files]
    └── Scripts\
        ├── Camera\
        │   └── CameraFollow2D5.cs       [2,941 bytes, 86 lines]
        ├── Combat\
        │   ├── DamageDealer.cs          [3,058 bytes, 93 lines]
        │   ├── DamageReceiver.cs        [2,077 bytes, 58 lines]
        │   ├── Health.cs                [2,515 bytes, 83 lines]
        │   └── HitStopManager.cs        [1,341 bytes, 48 lines]
        ├── Core\
        │   ├── Checkpoint.cs            [1,899 bytes, 60 lines]
        │   └── InputReader.cs           [3,557 bytes, 92 lines]
        ├── Enemies\
        │   └── TrainingDummy.cs         [2,878 bytes, 92 lines]
        └── Player\
            ├── PlayerCombat.cs          [4,649 bytes, 140 lines]
            └── PlayerMotor.cs           [7,288 bytes, 212 lines]
```

### Critical Structural Deficiencies in Unity Project
- **No `ProjectSettings/`**: Unity projects require `ProjectSettings/ProjectSettings.asset`, `TagManager.asset`, `InputManager.asset`, `QualitySettings.asset`, and `DynamicsManager.asset` to define physics layers, collision matrices, input axes, and build targets. None exist.
- **No `Packages/manifest.json`**: Unity package dependencies (such as Universal Render Pipeline `com.unity.render-pipelines.universal`, New Input System `com.unity.inputsystem`, or Test Framework `com.unity.test-framework`) are not defined.
- **No `.meta` files**: In Unity, every asset and directory must have an associated GUID `.meta` file. Without these, even if imported into a Unity editor, all cross-script component references, serialized field links, and layer masks are disconnected.
- **No Scenes or Prefabs**: There is no `.unity` scene file (e.g. `Prototype_Sandbox.unity` or `Courtyard_Level01.unity`). According to `Docs\Phase3_Prototype_Guide.md`, assembling the scene was documented as a manual 6-step GUI process for a human designer clicking in the Unity Editor.

---

## 3. Windows Toolchain & Environment Audit

System environment verification was conducted via PowerShell commands on the host:

| Tool / Runtime | Status | Path / Version Details | Impact on Unity Build |
|---|---|---|---|
| **Unity Editor** | ❌ **NOT INSTALLED** | Not found in PATH, `Program Files`, `Program Files (x86)`, registry, or drives C:, D:, E: | Cannot open, compile, or build Unity projects via CLI (`Unity.exe -batchmode`). |
| **Unity Hub** | ❌ **NOT INSTALLED** | Not found on system. | Cannot manage Unity licenses or Editor versions. |
| **`dotnet` (.NET SDK)** | ❌ **NOT INSTALLED** | Command `dotnet` not recognized. Not in `C:\Program Files\dotnet\`. | Cannot run `dotnet build`, `dotnet test`, or modern C# project CLI commands. |
| **`msbuild`** | ❌ **NOT INSTALLED** | No Visual Studio or Build Tools installed. | Cannot compile `.sln` or `.csproj` files. |
| **`csc` (C# Compiler)** | ⚠️ **LEGACY ONLY** | `C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe` (v4.8.9221.0, C# 5 only). | Cannot compile C# 6+ features (expression-bodied members, pattern matching, null-propagation). |
| **`UnityEngine.dll`** | ❌ **ABSENT** | Searched C:, D:, E: down to depth 4; 0 occurrences. | Cannot compile Unity C# scripts against required engine base classes (`MonoBehaviour`, `Vector3`, etc.). |
| **Python** | ✅ **AVAILABLE** | Python 3.13.15 installed and in PATH. | Available for test runners, mathematical verification, simulation. |
| **Node.js / npm** | ✅ **AVAILABLE** | Node v24.19.0 installed and in PATH. | Available for test runners, browser automation, static servers. |
| **Web Browsers** | ✅ **AVAILABLE** | Google Chrome & Microsoft Edge installed. | Can immediately execute and play WebGL/HTML5 builds at 60 FPS. |

---

## 4. Architectural Analysis of the 10 C# Scripts

Each script adheres to a modular component architecture with single responsibilities:

### 1. `CameraFollow2D5.cs` (`Vaelthorn.CameraSystem`)
- **Inheritance & Pattern**: `MonoBehaviour`, Singleton (`Instance`).
- **Functionality**:
  - Targets a `Transform` and smoothly interpolates along X and Y (`smoothTime = 0.18f`) using `Vector3.SmoothDamp`.
  - Enforces fixed depth `lockedZDistance = -12f`.
  - Sets downward perspective tilt `tiltAngleX = 5f` on Awake (`transform.rotation = Quaternion.Euler(tiltAngleX, 0f, 0f)`).
  - Forward look-ahead: adds `lookAheadDistance = 1.5f` along the target's facing direction (`target.forward.x > 0 ? 1f : -1f`).
  - Screen shake: `TriggerShake(intensity, duration)` adds random unit sphere perturbation (`shakeOffset.z = 0f`).
- **Deficiencies**: Does not clamp camera within level bounding boxes; relies on `target.forward.x` which can fail if character model root is rotated differently.

### 2. `DamageDealer.cs` (`Vaelthorn.Combat`)
- **Inheritance & Pattern**: `MonoBehaviour`, Hitbox Collision Controller.
- **Functionality**:
  - Placed on weapon collider or spell projectile.
  - Controls trigger collider state (`_triggerCollider.isTrigger = true`).
  - Maintains `HashSet<Collider> _hitObjectsThisSwing` to guarantee single-hit semantics per swing.
  - Exposes `EnableHitbox()` and `DisableHitbox()`.
  - In `OnTriggerEnter`: filters by `LayerMask targetLayers`, calls `DamageReceiver.ReceiveHit()`, and triggers `HitStopManager.RequestHitStop(hitStopDuration)`.
- **Deficiencies**: Purely PhysX dependent; requires predefined Unity collision layers; no kinematic ray/sweep cast algorithms.

### 3. `DamageReceiver.cs` (`Vaelthorn.Combat`)
- **Inheritance & Pattern**: `MonoBehaviour`, Hurtbox Receptor (`[RequireComponent(typeof(Health))]`).
- **Functionality**:
  - `ReceiveHit(damage, hitSourcePosition, knockbackForce)`:
    - Routes damage to `Health.TakeDamage()`.
    - Computes 2.5D knockback vector: `knockbackDir = (transform.position - hitSourcePosition).normalized; knockbackDir.z = 0; knockbackDir.y = 0.3f;`.
    - Applies force via `Rigidbody.AddForce(Impulse)` or `CharacterController.Move` via a 0.15s coroutine.
- **Deficiencies**: Does not scale damage against defense/armor; no check for parry/block state or dodge invulnerability.

### 4. `Health.cs` (`Vaelthorn.Combat`)
- **Inheritance & Pattern**: `MonoBehaviour`, Observable Health Component.
- **Functionality**:
  - Fields: `maxHealth = 100f`, `currentHealth`, `invulnerabilityDuration = 0.3f`.
  - C# Events: `OnHealthChanged(float current, float max)`, `OnDamaged(float amount, Vector3 hitPoint)`, `OnHealed(float amount)`, `OnDeath()`.
  - Invulnerability timer countdown in `Update()`.
- **Deficiencies**: Pure flat subtraction arithmetic without damage mitigation or scaling models.

### 5. `HitStopManager.cs` (`Vaelthorn.Combat`)
- **Inheritance & Pattern**: `MonoBehaviour`, Singleton Time Scaler.
- **Functionality**:
  - `RequestHitStop(float duration)` launches coroutine `PerformHitStop`.
  - Sets `Time.timeScale = 0.05f` (avoids zero to prevent physics divide-by-zero).
  - Waits using `WaitForSecondsRealtime(duration)` then restores previous time scale.
- **Deficiencies**: Global time scale modification impacts entire scene; ignores stacked rapid hit requests if `_isHitStopping` is true.

### 6. `Checkpoint.cs` (`Vaelthorn.Core`)
- **Inheritance & Pattern**: `MonoBehaviour`, World Interaction Anchor.
- **Functionality**:
  - Static property `LastCheckpointPosition`.
  - On trigger enter with Player: saves respawn coordinate, restores Player `Health` to full, modifies `Light shrineLight` color and plays `ParticleSystem`.
- **Deficiencies**: Non-persistent (lost on application exit).

### 7. `InputReader.cs` (`Vaelthorn.Core`)
- **Inheritance & Pattern**: `MonoBehaviour`, Singleton Input Bridge.
- **Functionality**:
  - Exposes public getters: `Horizontal`, `Vertical`, `MoveVector`, `JumpPressed`, `JumpHeld`, `LightAttackPressed`, `HeavyAttackPressed`, `DodgePressed`, `CastSpellPressed`, `InteractPressed`.
  - Reads legacy Unity `Input.GetAxisRaw("Horizontal")`, `Input.GetKeyDown(KeyCode.Space)`, `Input.GetMouseButtonDown(0/1)`.
  - Provides virtual API methods for on-screen touch UI (`SetVirtualHorizontal`, `TriggerVirtualJump`, etc.).
- **Deficiencies**: Uses legacy `UnityEngine.Input` instead of the URP New Input System (`UnityEngine.InputSystem.InputAction`) specified in `Technical_Plan_Vaelthorn.md`. In modern Unity templates, mixing legacy Input with New Input throws fatal runtime exceptions unless `Active Input Handling` is set to `Both` in `ProjectSettings`.

### 8. `TrainingDummy.cs` (`Vaelthorn.Enemies`)
- **Inheritance & Pattern**: `MonoBehaviour`, Reactive Punching Bag (`[RequireComponent(typeof(Health), typeof(DamageReceiver))]`).
- **Functionality**:
  - Subscribes to `Health.OnDamaged` and `Health.OnDeath`.
  - Visual feedback: flashes material color to `Color.red` for 0.12s on hit.
  - Auto-revival: on death, sets color to gray, waits 2.5s, then calls `Health.ResetHealth()`.
- **Deficiencies**: **Not an active enemy**. Has zero locomotion, zero patrol behavior, zero pursuit/aggro logic, zero attack capability, and no state machine.

### 9. `PlayerCombat.cs` (`Vaelthorn.Player`)
- **Inheritance & Pattern**: `MonoBehaviour`, Combo Sequencer.
- **Functionality**:
  - 3-hit combo with damage array: `comboDamages = { 20f, 25f, 40f }`.
  - Timing: `attackDuration = 0.22f`, `comboResetTime = 0.65f`.
  - Procedural weapon rotation fallback: sweeps weapon around Z axis using `Mathf.Sin(t * Mathf.PI)` (-70° for hits 1-2, -110° for hit 3).
  - Triggers finisher screen shake (`CameraFollow2D5.Instance.TriggerShake`) on hit 3.
  - Controls `DamageDealer.EnableHitbox()` / `DisableHitbox()`.
- **Deficiencies**:
  - No input buffer queue (drops rapid attack clicks during recovery).
  - **No parry system** (no timing window, no deflection callback).
  - **No Stygian Resonance resource** accumulation or spend.
  - **No Stygian Lance spell** or magic casting.

### 10. `PlayerMotor.cs` (`Vaelthorn.Player`)
- **Inheritance & Pattern**: `MonoBehaviour`, Kinematic Kinematics Engine (`[RequireComponent(typeof(CharacterController))]`).
- **Functionality**:
  - Horizontal movement: `moveSpeed = 8.5f`, `turnSpeed = 15f`, `FlipFacing()` turns 90° / -90° on Y.
  - Jumping physics formula: initial jump velocity $v_y = \sqrt{2 \cdot |g| \cdot h}$ (`jumpHeight = 2.4f`, `gravity = -26f`).
  - Snappy jump-feel: `fallMultiplier = 1.6f` when falling ($v_y < 0$); `lowJumpMultiplier = 2.2f` on early jump button release.
  - Quality of life: `coyoteTimeDuration = 0.12f`, `jumpBufferDuration = 0.12f`.
  - 2.5D constraint: hard-corrects $Z$ position to `lockedZPosition = 0f` every frame.
- **Deficiencies**:
  - Does not implement dodge roll motion (ignores `_input.DodgePressed`).
  - No ledge grab or wall slide physics.

---

## 5. Gap Analysis vs. Acceptance Criteria (R1 - R4)

| Original Request Acceptance Criteria | C# Implementation Status | Deficit / Missing Artifacts |
|---|---|---|
| **R1: Playable Game Production Build**<br>- Builds & executes without unhandled exceptions.<br>- Player navigates environment, engages enemies, completes combat encounter. | ❌ **UNBUILDABLE & UNPLAYABLE** | - Unity Editor & CLI tools absent from host.<br>- Zero scene files (`.unity`), zero materials, zero prefabs.<br>- Cannot produce a `.exe` or run headless in this environment. |
| **R2: Mathematical Game Algorithms**<br>- Explicit mathematical models for kinematics, trajectory arcs, hitboxes, damage formulas, state machines.<br>- Programmatic unit tests verifying math without NaN/inf. | ⚠️ **PARTIAL KINEMATICS ONLY** | - $v = \sqrt{2gh}$ present in `PlayerMotor`.<br>- **Missing**: Projectile trajectory mathematics ($y = x\tan\theta - \frac{g x^2}{2v^2\cos^2\theta}$).<br>- **Missing**: Mathematical AABB/Sphere overlap algorithms.<br>- **Missing**: Damage scaling/mitigation formula.<br>- **Missing**: Programmatic unit test suite (no test files exist). |
| **R3: Character Mechanics & Combat System**<br>- 3-hit combo with input buffering.<br>- Parry timing window & deflection.<br>- Stygian Resonance accumulation/drain.<br>- Stygian Lance spell execution.<br>- Shadow dodge roll with I-frames. | ⚠️ **~25% IMPLEMENTED** | - 3-hit combo exists, but lacks true input queue.<br>- **Missing**: Parry / Deflect mechanic (no 6-frame window).<br>- **Missing**: Counter-attack opportunity logic.<br>- **Missing**: Stygian Resonance gauge & expenditure.<br>- **Missing**: Stygian Lance spell (`PlayerMagic.cs` missing).<br>- **Missing**: Shadow dodge roll motion & I-frames. |
| **R4: Enemy Behaviors & Combat Encounters**<br>- Deterministic state machines (idle, patrol, aggro, attack, hit reaction, defeat).<br>- Elite or boss encounter (e.g. Vael-Krag Gatekeeper). | ❌ **0% REAL ENEMIES** | - Only `TrainingDummy.cs` exists (stationary punching bag).<br>- **Missing**: Finite state machine architecture.<br>- **Missing**: Patrol / pursuit / attack algorithms.<br>- **Missing**: Boss encounter (Vael-Krag Gatekeeper). |

---

## 6. Technical Feasibility & Production Readiness Assessment

### Can Unity Produce an Immediately Playable Build on this Machine?
**Conclusion: ABSOLUTELY NOT.**
1. **Toolchain Absence**: There is no Unity installation, no Unity Hub, and no Unity CLI on the machine. Downloading and installing Unity Hub + Unity 2022.3 LTS/URP requires multi-gigabyte downloads, interactive authentication with a Unity ID, and administrative setup that cannot be completed silently or autonomously.
2. **Missing Project Infrastructure**: Even if a Unity compiler existed, the repository lacks the required Unity project scaffold (`ProjectSettings`, `Packages/manifest.json`, `.meta` files). Unity would treat this folder as a raw asset folder, regenerating new random GUIDs for every file, which breaks component link bindings.
3. **No CLI Compilation Pathway**: The machine lacks `.NET SDK` (`dotnet`) and `UnityEngine.dll`. It is impossible to compile these scripts into an assembly or execute unit tests in PowerShell without mock stubs.

### The Standalone 3D WebGL / HTML5 Prototype Alternative
In contrast, `E:\Vaelthorn\Vaelthorn_Playable_Prototype.html` is an already functioning, self-contained 3D implementation featuring:
- Three.js WebGL 3D rendering with directional eclipse lighting, real-time shadows, gothic stone architecture, platforms, and atmospheric ember particles.
- 2.5D camera rail with dynamic tilt and look-ahead.
- Player character with running, jumping, and 3-hit combo attack animations.
- Training dummy with hit reaction, health bar, floating damage numbers, and knockback.
- Web Audio API procedural sound synthesizer (blade swooshes, hit impacts, jumps).
- Full HUD (Player health, Resonance gauge, combo counter).
- Immediately playable and verifiable in Chrome or Edge on this Windows machine.

---

## 7. Strategic Recommendations for the Team

1. **Adopt Standalone 3D WebGL / HTML5 as the Primary Platform Target**:
   - Authorized directly under Requirement R1: *"The team decides the primary target architecture (expanding the Unity C# project or enhancing the standalone 3D WebGL build) to ensure immediate playability and robust stability."*
   - Eliminates 100% of the environment toolchain risks, licensing constraints, and missing Unity infrastructure.
2. **Port Proven C# Architectural Patterns to the WebGL Architecture**:
   - The modular design of `PlayerMotor.cs`, `HitStopManager.cs`, and `Health.cs` provides clear mathematical formulas that can be adapted into clean, modular TypeScript/JavaScript classes.
3. **Implement the Missing R2-R4 Systems**:
   - **Math Algorithms**: Implement explicit mathematical functions for kinematics ($v = \sqrt{2gh}$), trajectory calculation, box-box/capsule-box overlap math, and damage scaling ($D_{final} = D_{base} \times (1 - \frac{\text{Armor}}{\text{Armor} + 100})$).
   - **Combat Expansion**: Add parry window timing (e.g. 100ms window), Stygian Resonance accumulation on hit/parry, and Stygian Lance spell projection.
   - **Enemy State Machine**: Implement a formal FSM with states (`Idle`, `Patrol`, `Aggro`, `Attack`, `HitReaction`, `Defeat`) and a multi-phase Boss encounter (*Vael-Krag, The Weeping Gatekeeper*).
4. **Verification Strategy**:
   - Author a standalone, headless mathematical unit test suite executable via `node` or `python` to verify kinematics, hitbox overlap formulas, damage mitigation, and state machine transitions without NaN/infinite values.
   - Verify playability by launching the game in the installed Google Chrome or Edge browser.
