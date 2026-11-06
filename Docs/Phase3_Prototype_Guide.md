# PHASE 3: PLAYABLE PROTOTYPE ASSEMBLY GUIDE
**Project:** VAELTHORN — The Oath of Darkness  
**Path:** `E:\Vaelthorn`  
**Phase:** 3 — Playable Graybox Prototype  

All 10 foundational C# scripts have been implemented and are located in:  
`E:\Vaelthorn\Assets\_Project\Scripts\`

---

## 1. INSTALLED SCRIPTS OVERVIEW

```
E:\Vaelthorn\Assets\_Project\Scripts\
├── Core\
│   ├── InputReader.cs       -> Cross-platform input (Keyboard, Mouse, Gamepad, Android touch)
│   └── Checkpoint.cs        -> Rest shrine: saves respawn, restores HP, lights up
├── Player\
│   ├── PlayerMotor.cs       -> 2.5D physics, Z=0 lock, Coyote Time, Jump Buffering
│   └── PlayerCombat.cs      -> 3-hit light combo, procedural weapon arcs, finisher screen shake
├── Combat\
│   ├── Health.cs            -> Reusable HP, I-frames, heal/damage events
│   ├── DamageDealer.cs      -> Weapon hitbox trigger, duplicate-hit prevention, hit-stop
│   ├── DamageReceiver.cs    -> Hurtbox, routes damage to Health, applies 2.5D knockback
│   └── HitStopManager.cs    -> AAA micro-freeze on impact (0.05s freeze frame)
├── Enemies\
│   └── TrainingDummy.cs     -> Reactive enemy: flashes red, tracks damage, auto-revives
└── Camera\
    └── CameraFollow2D5.cs   -> Smooth 2.5D camera rail, 5° downward tilt, forward look-ahead
```

---

## 2. SETTING UP UNITY & OPENING THE PROJECT

### If you do NOT have Unity installed yet:
You can install **Unity Hub** directly with one command in PowerShell:
```powershell
winget install --id Unity.UnityHub -e
```
Or download it from: [unity.com/download](https://unity.com/download)

Once Unity Hub is installed:
1. Open **Unity Hub** and sign in with a free Unity ID.
2. In the **Installs** tab, install **Unity 2022.3 LTS** or **Unity 6** with the **Universal Render Pipeline (URP)** template.
3. In the **Projects** tab, click **Add** (or **Open**) and choose the folder:  
   `E:\Vaelthorn`

---

## 3. ASSEMBLING THE PROTOTYPE IN 5 MINUTES (STEP-BY-STEP)

Inside Unity, create a new scene (`File > New Scene > Basic (URP)`), and save it as `Prototype_Sandbox` inside `Assets/_Project/Scenes/`.

```
=============================================================================
                      THE 2.5D GRAYBOX ARENA LAYOUT
=============================================================================

          [ Main Camera ] (CameraFollow2D5, Z = -12, Tilt = 5°)
                 |
                 v
   +---------------+        +---------------+        +---------------+
   | [Checkpoint]  |        |    [Player]   | =====> | [Train Dummy] |
   |  Rest Shrine  |        |  (Ebon Knight)| (Combos)|  (Auto-Revive)|
   +---------------+        +---------------+        +---------------+
=============================================================================
[ GROUND PLANE: 3D Box scaled (30, 1, 4), Position: (0, -0.5, 0), Locked Z = 0 ]
=============================================================================
```

### Step 1: Create the Ground Plane
1. In the Hierarchy, right-click $\to$ **3D Object** $\to$ **Cube**.
2. Rename it to `Ground`.
3. Set its Transform:
   - **Position:** `(0, -0.5, 0)`
   - **Scale:** `(30, 1, 4)`
4. Set its Layer to **Default** (or create a layer named `Ground`).

---

### Step 2: Create the Player (The Knight Capsule)
1. In the Hierarchy, right-click $\to$ **3D Object** $\to$ **Capsule**.
2. Rename it to `Player`.
3. Set its Transform:
   - **Position:** `(0, 1, 0)`
   - **Rotation:** `(0, 90, 0)`
4. Add the following components to `Player` (click **Add Component** in Inspector):
   - `CharacterController` (Center: `0, 0, 0`, Height: `2`, Radius: `0.5`)
   - `InputReader`
   - `PlayerMotor`
   - `Health`
   - `DamageReceiver`
   - `PlayerCombat`
5. On the `PlayerMotor` component in Inspector:
   - Check that **Move Speed** is set to `8.5` and **Jump Height** is `2.4`.

---

### Step 3: Create the Sword Hitbox
1. In the Hierarchy, right-click on `Player` $\to$ **3D Object** $\to$ **Cube**.
2. Rename it to `SwordHitbox`.
3. Set its Transform:
   - **Position:** `(0.7, 0, 0)` (in front of the player)
   - **Scale:** `(0.2, 0.8, 0.2)`
4. On `SwordHitbox`:
   - Check the **Is Trigger** box on its `BoxCollider`.
   - Add the `DamageDealer` component.
   - On `DamageDealer`, set **Target Layers** to include `Default` (or `Enemy`).
5. In the `Player` Inspector, drag `SwordHitbox` into the **Weapon Hitbox Reference** field on `PlayerCombat`.

---

### Step 4: Setup the 2.5D Camera
1. Select the `Main Camera` in the Hierarchy.
2. Set its Transform:
   - **Position:** `(0, 2, -12)`
   - **Rotation:** `(5, 0, 0)`
3. Add the `CameraFollow2D5` component.
4. Drag the `Player` object from the Hierarchy into the **Target** field.

---

### Step 5: Create the Training Dummy Enemy
1. In the Hierarchy, right-click $\to$ **3D Object** $\to$ **Cylinder**.
2. Rename it to `TrainingDummy`.
3. Set its Transform:
   - **Position:** `(6, 1, 0)`
   - **Scale:** `(1, 1, 1)`
4. Add the following components:
   - `Health` (Max Health: `100`)
   - `DamageReceiver`
   - `TrainingDummy` (Drag the cylinder itself into the **Dummy Renderer** field).

---

### Step 6: Create the Checkpoint Shrine
1. In the Hierarchy, right-click $\to$ **3D Object** $\to$ **Cube**.
2. Rename it to `Checkpoint`.
3. Set its Transform:
   - **Position:** `(-6, 0.5, 0)`
   - **Scale:** `(0.8, 2, 0.8)`
4. Set its `BoxCollider` to **Is Trigger** = `true`.
5. Add the `Checkpoint` component.
6. (Optional) Right-click `Checkpoint` $\to$ **Light** $\to$ **Point Light**, and drag it into the **Shrine Light** field.

---

## 4. CONTROLS & HOW TO TEST

Click the **Play** button at the top of Unity!

| Action | PC Keyboard & Mouse | Expected Behavior |
| :--- | :--- | :--- |
| **Move Left / Right** | `A` / `D` or Left/Right Arrows | Knight moves smoothly along the 2.5D track and faces movement direction. |
| **Short Hop** | Tap `Spacebar` | Low platforming jump. |
| **Full Jump** | Hold `Spacebar` | Full-height leap; snappy gravity brings the knight down cleanly. |
| **Light Combo** | Tap `Left Mouse Button` or `J` | 3-hit combo string. Notice the third strike deals heavy damage and triggers **Screen Shake**! |
| **Hit the Dummy** | Attack near the cylinder | The dummy flashes red, takes knockback, displays damage logs in the Unity Console, and triggers a **0.05s Hit-Stop**! |
| **Activate Checkpoint** | Walk to the left shrine | The shrine activates, restores your HP, and saves your respawn position. |
