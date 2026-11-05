# SPECIFICATION REPORT: VAELTHORN — THE OATH OF DARKNESS
**Author:** `spec_miner_survey_1` (Specification Miner)  
**Date:** 2026-11-01  
**Working Directory:** `E:\Vaelthorn\.agents\teamwork\spec_miner_survey_1\`  
**Target Project:** `E:\Vaelthorn`  

---

## 1. Executive Summary & Specification Sources

This specification report provides a comprehensive, exhaustive inventory of all functional features, mathematical formulations, kinematics, combat algorithms, enemy artificial intelligence state machines, feedback mechanics, and edge case boundaries for **"Vaelthorn: The Oath of Darkness"** (a 2.5D Dark Fantasy Action-Adventure RPG).

### Authoritative Specification Sources Analyzed:
1. **Game Design Document (GDD)**: `E:\Vaelthorn\Docs\GDD_Vaelthorn.md` (World, combat identity, resonance & sever system, weapon/magic arsenal, 5 enemy archetypes, 3 boss encounters, 2.5D visual direction, roadmap).
2. **Technical Architecture Plan**: `E:\Vaelthorn\Docs\Technical_Plan_Vaelthorn.md` (Engine selection, URP pipeline, modular component architecture, cross-platform input layer, directory layout).
3. **Phase 3 Prototype Assembly Guide**: `E:\Vaelthorn\Docs\Phase3_Prototype_Guide.md` (Exact setup coordinates, inspector field defaults, graybox testing guidelines).
4. **Authoritative C# Codebase**: `E:\Vaelthorn\Assets\_Project\Scripts\`
   - `Player/PlayerMotor.cs` (Kinematics, jump physics, coyote time, jump buffer, Z-plane lock)
   - `Player/PlayerCombat.cs` (3-hit combo chain, damage tuning, procedural swing angles)
   - `Combat/Health.cs` (Universal health model, I-frames, event routing)
   - `Combat/DamageDealer.cs` (Hitbox activation, duplicate hit suppression, hit-stop triggering)
   - `Combat/DamageReceiver.cs` (Hurtbox routing, 2.5D directional knockback)
   - `Combat/HitStopManager.cs` (Timescale micro-freezes)
   - `Enemies/TrainingDummy.cs` (Damage reaction, visual flash, auto-revive routine)
   - `Camera/CameraFollow2D5.cs` (2.5D tracking rail, 5° downward pitch, look-ahead, screen shake)
   - `Core/InputReader.cs` (Hardware-agnostic input bridge, Android touch hooks)
   - `Core/Checkpoint.cs` (Rest shrine, respawn anchor, healing trigger, visual lighting)
5. **Playable 3D WebGL Prototype**: `E:\Vaelthorn\Vaelthorn_Playable_Prototype.html` (Complete Three.js runtime implementation, procedural Web Audio synthesizer, mobile touch controls, projectile raycasting, particle drift).

---

## 2. Features Discovered

| # | Category | Feature | Description | Inputs | Outputs | Error Behavior | Discovered Via |
|---|----------|---------|-------------|--------|---------|----------------|----------------|
| 1 | Movement & Kinematics | 2.5D Plane Constraint | Character is strictly constrained to the $Z = 0$ plane, preventing any physics drift into foreground or background. | Physics updates / controller motion | Position vector $(x, y, 0)$ | If $\|z - 0\| > 0.001$, coordinate is clamped to $0.0$ | `PlayerMotor.cs:48,183-192`, `Vaelthorn_Playable_Prototype.html:426,875` |
| 2 | Movement & Kinematics | Horizontal Running & Acceleration | Smooth horizontal locomotion along X axis at $8.5 - 9.0\text{ m/s}$ with instantaneous or responsive acceleration. | Keyboard `A`/`D`, Arrow keys, Gamepad Left Stick, Touch D-Pad | $v_x = \text{input} \times \text{speed}$, position updated by $v_x \cdot \Delta t$ | Zero input immediately drops $v_x$ to 0 (or applies friction/deceleration) | `PlayerMotor.cs:16,130-146`, `Vaelthorn_Playable_Prototype.html:632,861-875` |
| 3 | Movement & Kinematics | Directional Facing Flip | Character smoothly flips facing direction ($+90^\circ$ for right, $-90^\circ$ for left) when horizontal input exceeds $0.1$. | $\text{input}_x > 0.1$ or $\text{input}_x < -0.1$ | Transform rotation `Quaternion.Euler(0, ±90, 0)` | Inputs between $-0.1$ and $0.1$ maintain previous facing | `PlayerMotor.cs:18,138-145,194-200`, `Vaelthorn_Playable_Prototype.html:868-870` |
| 4 | Movement & Kinematics | Full Jump Kinematics | Parabolic jump launching player to peak height $h = 2.4\text{ m}$ using initial velocity $v_{y0} = \sqrt{2 \cdot \|g\| \cdot h}$. | `Spacebar` press (held), Gamepad South button, Touch `JUMP` | $v_{y0} \approx 11.17\text{ m/s}$ ($14.5\text{ m/s}$ WebGL), $a_y = -26\text{ m/s}^2$ | Blocked if airborne and coyote timer expired | `PlayerMotor.cs:23,151-157`, `Vaelthorn_Playable_Prototype.html:633,723` |
| 5 | Movement & Kinematics | Variable Jump Cut (Low Hop) | Releasing the jump button early applies an increased gravity multiplier ($2.2\times$), cutting the jump short. | Releasing `Spacebar` while $v_y > 0$ (`!JumpHeld`) | $a_y = g \times 2.2 = -57.2\text{ m/s}^2$ | If jump held until apex, normal gravity applies | `PlayerMotor.cs:32,165-169`, `Technical_Plan_Vaelthorn.md:158` |
| 6 | Movement & Kinematics | Snappy Falling Gravity | Downward descent applies an increased gravity multiplier ($1.6\times$) to avoid floatiness. | $v_y < 0$ | $a_y = g \times 1.6 = -41.6\text{ m/s}^2$ | Clamped to terminal velocity if configured | `PlayerMotor.cs:29,160-164`, `GDD_Vaelthorn.md:7` |
| 7 | Movement & Kinematics | Coyote Time | Grace window of $0.12\text{ s}$ allowing jump execution immediately after walking off a ledge. | Jump input within $0.12\text{ s}$ of becoming ungrounded | Valid jump executed while airborne | Counter expires after $0.12\text{ s}$, disallowing jump | `PlayerMotor.cs:36,110-117,151`, `Vaelthorn_Playable_Prototype.html:635,723-728` |
| 8 | Movement & Kinematics | Jump Buffering | Queue window of $0.12\text{ s} - 0.15\text{ s}$ storing jump input tapped right before landing. | Jump input tapped while airborne within $0.12\text{ s}$ of landing | Automatic jump on first grounded frame | Counter expires after $0.12\text{ s}$ if ground not reached | `PlayerMotor.cs:39,120-128,151`, `GDD_Vaelthorn.md:119` |
| 9 | Movement & Kinematics | Ground Detection & Slope Glue | Spherical ground check; when grounded and $v_y < 0$, applies a sticky $-2.0\text{ m/s}$ velocity. | `Physics.CheckSphere` at groundCheck radius $0.25\text{ m}$ | `_isGrounded = true`, $v_y = -2\text{ m/s}$ | Prevents bouncing or skipping on downhill slopes | `PlayerMotor.cs:42-45,88-105` |
| 10 | Movement & Kinematics | Shadow Dodge Roll | High-speed dash roll granting invulnerability frames (I-frames) through attacks. | `Left Shift`, `L` key, or Touch `DODGE` button | $v_x = \pm 16.0\text{ m/s}$ for $0.35\text{ s}$, I-frame active, cloak sweeps low | Cannot cancel into another roll while roll active | `GDD_Vaelthorn.md:114`, `InputReader.cs:72`, `Vaelthorn_Playable_Prototype.html:730-736` |
| 11 | Movement & Kinematics | Aerial Plunge | Downward plunging sword attack while airborne that slams into the ground. | Down + Attack (Mid-air) | High-speed downward dive, ground impact shockwave, screen shake | Interrupted if player touches hazard before ground | `GDD_Vaelthorn.md:115` |
| 12 | Combat Mechanics | 3-Hit Light Attack Combo | Sequence of 3 fluid strikes: 2 fast horizontal sweeps into an overhead cleaving finisher. | Left Mouse Button, `J` key, `Z` key, Touch `SLASH` | Step 1 (20-22 dmg), Step 2 (25-28 dmg), Step 3 (40-48 dmg) | Attacking while swing active is locked out until buffer window | `PlayerCombat.cs:20-28,68-100`, `Vaelthorn_Playable_Prototype.html:738-795` |
| 13 | Combat Mechanics | Combo Reset Window | Combo advances if tapped within $0.65 - 0.70\text{ s}$; resets back to step 1 if player idles. | Elapsed time since last attack $> \text{resetTime}$ | `_currentComboIndex` resets to 0 (or 1 on next press) | If timer elapses during combo, next hit is Hit 1 | `PlayerCombat.cs:27,56-59,133-137`, `Vaelthorn_Playable_Prototype.html:642,742` |
| 14 | Combat Mechanics | Active Hitbox Triggering | Weapon collider is only active during the swing frames ($0.22\text{ s}$ duration), preventing passive contact damage. | `ExecuteAttack()` coroutine | Enables trigger collider at start of swing, disables at end | Swing interrupted resets collider to disabled | `PlayerCombat.cs:24,102-131`, `DamageDealer.cs:43-64` |
| 15 | Combat Mechanics | Duplicate Hit Prevention | Ensures a single weapon swing damages each target entity only once. | Weapon trigger collision with hurtbox | Target added to `HashSet<Collider>`; subsequent collisions in same swing ignored | Cleared on next swing initiation | `DamageDealer.cs:25,74-75` |
| 16 | Combat Mechanics | Heavy Cleave / Shield Shatter | Charged heavy attack (hold attack $0.5\text{ s}$) that shatters enemy tower shields and inflicts high poise damage. | Hold Attack for $0.5\text{ s}$ | Destroys shield guard, camera micro-punch (2% zoom-in), dust burst | Interrupted by heavy stagger if poise broken during wind-up | `GDD_Vaelthorn.md:112,185` |
| 17 | Combat Mechanics | Hit-Stop Feedback | Micro-freeze slowing time scale to $0.05$ (or frame freeze) upon hit impact to convey tactile weight. | Collision between DamageDealer and DamageReceiver | Light hits: $0.04 - 0.05\text{ s}$; Finisher: $0.08\text{ s}$; Parry: $0.08\text{ s}$ | Real-time countdown prevents freezing physics engine permanently | `DamageDealer.cs:85-90`, `HitStopManager.cs:26-46`, `Vaelthorn_Playable_Prototype.html:785,855` |
| 18 | Combat Mechanics | 2.5D Directional Knockback | Pushes target backward along X axis with slight vertical pop ($y=0.3$), locked to $Z=0$. | Hit connection with `knockbackForce = 6.0\text{ m/s}` | Target displaced away from attacker along 2.5D plane | Knockback direction Z component strictly zeroed | `DamageReceiver.cs:29-55`, `Vaelthorn_Playable_Prototype.html:775` |
| 19 | Defense & Counter | Perfect Parry / Deflection | Frame-tight parry within a 6-frame ($0.10\text{ s}$) window that deflects incoming melee attacks. | Timed Guard input (`L1` / `Left Shift`) | $0$ damage taken, $0.08\text{ s}$ hit-stop freeze, sparks explosion, enemy poise break | Mistimed parry leaves player poise vulnerable to counterattack | `GDD_Vaelthorn.md:101,113`, `ORIGINAL_REQUEST.md:38` |
| 20 | Defense & Counter | Poise Break & Riposte | Staggering an enemy through parry or heavy cleave opens a $1.0 - 1.5\text{ s}$ critical counter-attack window. | Enemy in `STAGGER` state + Attack input | Triggers critical finisher dealing $2.0\times - 3.0\times$ damage | Window expires if player fails to strike in time | `GDD_Vaelthorn.md:104,113` |
| 21 | Resource Systems | Stygian Resonance Gauge | Combat energy gauge ($0 - 100$) accumulated through successful sword attacks and perfect parries. | Light hit connects ($+15$), Perfect parry ($+100$ full burst) | Builds gauge; updates HUD fill bar | Caps at 100; drains slowly out of combat | `GDD_Vaelthorn.md:98-105`, `Vaelthorn_Playable_Prototype.html:628,778` |
| 22 | Resource Systems | Overdrive Mode | Passive combat buff activated while sustaining a full 100% Stygian Resonance gauge. | Stygian Resonance sustained at $100$ | $+30\%$ attack speed, $+30\%$ enemy stagger generation | Drops as soon as resonance is expended or decays below 100 | `GDD_Vaelthorn.md:103` |
| 23 | Resource Systems | Stygian Lance Spell | High-velocity starlight railgun beam that pierces all enemies in a horizontal line along the 2.5D plane. | Right Click, `U` key, `X` key, Touch `SPELL` button (Cost: 25 Resonance) | Spawns $16\text{ m}$ beam, deals 55 piercing damage, snipes elevated snipers | Fails / blocked if Resonance $< 25$ | `GDD_Vaelthorn.md:147-150`, `Vaelthorn_Playable_Prototype.html:798-831` |
| 24 | Resource Systems | Cinder Nova Spell | 360-degree ground-slam blast of black fire clearing nearby swarms and burning cursed briars. | Spell input 2 (Consumes Resonance/Mana) | Area blast radius $r = 4.0\text{ m}$, destroys obstacles | Fails if insufficient energy | `GDD_Vaelthorn.md:151-153` |
| 25 | Resource Systems | Aegis of Umbra Spell | Protective runic shield active for $4.0\text{ s}$; completely absorbs next hit and converts it into $50\%$ health healing. | Spell input 3 (Consumes Resonance/Mana) | 4-second buff; on next hit taken, $0$ damage and heals $50\%$ HP | Buff consumed after one hit or upon 4s expiration | `GDD_Vaelthorn.md:154-155` |
| 26 | Resource Systems | Universal Health System | Universal health container managing HP, death state, healing, and damage events. | `TakeDamage(amount)`, `Heal(amount)`, `ResetHealth()` | `OnHealthChanged`, `OnDamaged`, `OnDeath` events | Damage ignored if entity is already dead or in I-frame state | `Health.cs:10-82`, `Vaelthorn_Playable_Prototype.html:626,833` |
| 27 | Resource Systems | Post-Damage Invincibility Frames | Post-hit invincibility lasting $0.3\text{ s}$ to prevent multi-hit damage stacking from single hazards. | Receiving damage in `Health.cs` | `_invulnerabilityTimer = 0.3f`, blocks incoming damage | Timer decrements via delta time; reset on respawn | `Health.cs:18,47-51` |
| 28 | Weapons & Arsenal | Ashen Longsword ("Penumbra") | Balanced starter weapon with dash-thrust piercing special move. | Primary weapon equip | Balanced swing speed, medium reach, 3-hit combo | N/A | `GDD_Vaelthorn.md:132-134` |
| 29 | Weapons & Arsenal | Executioner's Great-Mace ("Earth-Shaker") | Heavy weapon featuring Hyper-Armor during swings; smashes cracked stone walls to reveal secrets. | Heavy weapon equip | Uninterruptible by light hits, breaks cracked walls/floors | Slow recovery window on whiff | `GDD_Vaelthorn.md:136-139` |
| 30 | Weapons & Arsenal | Twin Eclipse Daggers ("Fang & Talon") | Rapid dual blades with high resonance generation and vault-behind backstab special. | Dual dagger equip | High attack speed, rapid resonance gain, back-vault strike | Lower per-hit stagger power | `GDD_Vaelthorn.md:140-143` |
| 31 | Enemy AI & SM | Deterministic AI State Machine | Core 6-state enemy behavior system: Idle, Patrol, Aggro/Pursuit, Attack, Hit Reaction, Defeat. | Sensory inputs: distance to player, line-of-sight, health, timers | Deterministic state transitions | Invalid transitions default back to Idle | `Technical_Plan_Vaelthorn.md:124`, `ORIGINAL_REQUEST.md:28` |
| 32 | Enemy AI & SM | The Ashen Footman (Grunt) | Basic patrol/melee unit with telegraphed 2-hit sword slash (white glint). | Alerted when player within $8\text{ m}$; attacks when within $2\text{ m}$ | 2-hit slash with $0.3\text{ s}$ telegraph wind-up | Can be parried to break poise | `GDD_Vaelthorn.md:174-176` |
| 33 | Enemy AI & SM | Grave-Weaver Crawler (Ambusher) | Ceiling-crawling skirmisher that drops down for ambush flurry and leaps backward when struck. | Triggered when player passes directly underneath | Drop claw flurry, backward retreat leap upon hit | Vulnerable during drop recovery | `GDD_Vaelthorn.md:177-179` |
| 34 | Enemy AI & SM | Cinder-Bough Archer (Sniper) | Elevated platform shooter firing parabolic flaming stakes; melee defense peg-leg kick and roll. | Range check to player: fires if $> 4\text{ m}$; kicks/rolls if $< 2\text{ m}$ | Parabolic projectile trajectory ($v_0 \approx 14\text{ m/s}$), evasive roll | Projectiles blocked by parry or terrain | `GDD_Vaelthorn.md:180-182` |
| 35 | Enemy AI & SM | The Iron Phalanx (Juggernaut) | Shielded juggernaut blocking all frontal light attacks; slow heavy hammer slam. | Frontal attack check | Deflects light attacks; hammer slam forces parry/dodge or Mace shield break | Rear attacks bypass shield completely | `GDD_Vaelthorn.md:183-185` |
| 36 | Enemy AI & SM | Wisp of the Hollow Crown (Air Disruptor) | Flying support entity hovering out of melee reach, casting slow homing violet orbs; suicide explosion on death. | Hover height $y=4\text{ m}$; casts homing orb every $3\text{ s}$ | Homing orb ($v = 4\text{ m/s}$), area explosion on defeat ($r = 3\text{ m}$) | Requires jump attacks or Stygian Lance to defeat | `GDD_Vaelthorn.md:186-189` |
| 37 | Enemy AI & SM | Training Dummy Test Subject | Immortal sandbox testing dummy that flashes red, displays damage numbers, and auto-revives after $2.5\text{ s}$. | Hit reception from DamageDealer | Flashes red ($0.12\text{ s}$), logs damage, auto-revives after $2.5\text{ s}$ | While dead/reviving, dummy turns gray and ignores new damage | `TrainingDummy.cs:12-91`, `Vaelthorn_Playable_Prototype.html:589-615,789-793` |
| 38 | Boss Encounter | Boss 1: Vael-Krag (The Gatekeeper) Phase 1 | 8-foot fallen knight boss using massive bell club; Wide Bell Sweep and Seismic Shockwave Slam. | Boss HP $> 50\%$ | Wide horizontal sweep ($r = 4.5\text{ m}$), floor shockwave ($v = 10\text{ m/s}$) | Ground shockwave must be avoided by jumping | `GDD_Vaelthorn.md:194-200` |
| 39 | Boss Encounter | Boss 1: Vael-Krag (The Gatekeeper) Phase 2 | Ignited violet bell; slams leave burning ground hazard pools; leaping arena slams requiring I-frame rolls. | Boss HP $\le 50\%$ | Burning ground pools (6s duration), cross-arena leaps | Landing shockwave requires dodge roll I-frames | `GDD_Vaelthorn.md:201-202` |
| 40 | Boss Encounter | Boss 2: Lady Morwyn (Agile Duellist) | Fast rhythm boss in Sunken Arboretum; shadow teleportation, 3-strike musical flurry, shrinking thorn walls. | Combat triggers and low health threshold | Multi-hit parry rhythm test, arena shrinkage | Teleport interrupted if parried cleanly | `GDD_Vaelthorn.md:203-209` |
| 41 | Boss Encounter | Boss 3: Malakor (Eclipse Wyrm-Knight) | Cinematic dragoon with shadow wings; aerial sweeps, full-screen dark fire breath requiring vertical climbing. | Ground/aerial state alternation | Dark fire breath covering floor plane; forces latching to spires | Spire hazard avoidance requires Wall Jump / Air Dash | `GDD_Vaelthorn.md:210-216` |
| 42 | Feedback & Camera | 2.5D Camera Tracking Rail | Camera follows player smoothly along X and Y with locked $Z = -12\text{ m}$, downward tilt $5^\circ$, and offset $(0, 1.8)$. | Player position $(x, y)$ | Camera transform smoothly interpolated via `SmoothDamp` ($0.18\text{ s}$) | Camera Z position strictly clamped to $-12\text{ m}$ | `CameraFollow2D5.cs:15-75`, `Vaelthorn_Playable_Prototype.html:384-387,948-954` |
| 43 | Feedback & Camera | Forward Look-Ahead Anticipation | Camera leads forward by $1.5 - 2.2\text{ m}$ in the player's facing direction while moving. | Target facing direction | Offsets target camera X by $+1.5\text{ m}$ (right) or $-1.5\text{ m}$ (left) | Direction change smoothly caught by `SmoothDamp` | `CameraFollow2D5.cs:28,56-60`, `Vaelthorn_Playable_Prototype.html:948-950` |
| 44 | Feedback & Camera | Exponential Screen Shake | Trauma/shake applied on heavy impacts, critical finishers, and boss slams; decays over time. | Hit finisher ($0.25 - 0.35$), boss slam ($0.50$) | Camera displacement offset $\Delta x, \Delta y$; decays to 0 over $0.18\text{ s}$ | Z axis displacement zeroed to preserve 2.5D framing | `CameraFollow2D5.cs:79-84`, `PlayerCombat.cs:98`, `Vaelthorn_Playable_Prototype.html:955-959` |
| 45 | Feedback & Presentation | Procedural Audio Synthesizer | Web Audio synth generating procedural sounds: slash whoosh, punchy hit impact, railgun spell, and healing chime. | Audio trigger events (`playSlash`, `playHit`, `playSpell`, `playHeal`) | Oscillator nodes with exponential frequency and gain ramps | Initializes audio context on first user input gesture | `Vaelthorn_Playable_Prototype.html:297-375` |
| 46 | Feedback & Presentation | Visual Runic Visor Glow & Cloak Physics | High-contrast starlight-blue glowing visor slit (`#00D2FF`) and dynamic physics-tilted cape for readability. | Player horizontal velocity $v_x$ | Cloak rotation $\theta_z = 0.15 + (\|v_x\| / v_{\max}) \times 0.45\text{ rad}$ | Visor remains fully visible against pitch-black backgrounds | `GDD_Vaelthorn.md:63,87-89`, `Vaelthorn_Playable_Prototype.html:545-557,928` |
| 47 | Feedback & Presentation | Screen-Projected Floating Damage Numbers | 3D world hit coordinates projected to 2D screen; floating numbers animate upward with crit color styling. | Target hit event with damage amount and crit flag | HTML/UI floating number animated with fadeout and scale punch | Projected behind camera coordinates culled or clamped | `Vaelthorn_Playable_Prototype.html:207-223,652-673` |
| 48 | Environment & Systems | Checkpoint Sanctuary Shrine | Dark fantasy obelisk shrine that saves respawn position, restores player to 100% HP, and lights radiant blue. | Player entering trigger volume / pressing interact | Sets `LastCheckpointPosition`, heals player, lights point light | Trigger deactivated while active to prevent re-triggering loops | `Checkpoint.cs:11-58`, `Vaelthorn_Playable_Prototype.html:502-517,931-937` |
| 49 | Controls & Input | Hardware-Agnostic Input Reader | Translates physical hardware (Keyboard, Mouse, Gamepad, Touch buttons) into high-level action events. | Input polling in `Update()` | Public properties: `Horizontal`, `JumpPressed`, `LightAttackPressed`, etc. | Unused inputs clear flags every frame | `InputReader.cs:11-91`, `Technical_Plan_Vaelthorn.md:83-106` |
| 50 | Controls & Input | Mobile Virtual Touch Controls | On-screen virtual D-Pad (Left/Right) and round action buttons (DODGE, SPELL, JUMP, SLASH) for touch devices. | Touchstart / touchend events on mobile viewport | Triggers `SetVirtualHorizontal`, `TriggerVirtualJump`, etc. | Hidden on desktop; automatically shown if touch detected | `InputReader.cs:85-90`, `Vaelthorn_Playable_Prototype.html:165-205,289-293,707-718` |

---

## 3. Mathematical Models & Exact Formulas

### 3.1 Kinematics & Numerical Integration

The game runs on a fixed or semi-fixed delta time step $\Delta t$ ($\le 0.05\text{ s}$, nominally $1/60\text{ s} \approx 0.01667\text{ s}$).

#### Horizontal Kinematics:
$$v_x(t + \Delta t) = u_x \cdot v_{\text{move}}$$
$$x(t + \Delta t) = x(t) + v_x(t + \Delta t) \cdot \Delta t$$
Where:
- $u_x \in [-1.0, 1.0]$ is normalized horizontal directional input.
- $v_{\text{move}} = 8.5\text{ m/s}$ (Unity) or $9.0\text{ m/s}$ (WebGL).
- When dodging: $v_x = \text{facingDir} \times 16.0\text{ m/s}$ for $t \in [0, 0.35\text{ s}]$.

#### Vertical Jump & Gravity Integration:
Jump takeoff velocity is analytically derived from target apex height $h_{\text{jump}} = 2.4\text{ m}$ and downward gravity $g = -26.0\text{ m/s}^2$:
$$v_{y0} = \sqrt{2 \cdot |g| \cdot h_{\text{jump}}} = \sqrt{2 \cdot 26.0 \cdot 2.4} = \sqrt{124.8} \approx 11.1714\text{ m/s}$$

The instantaneous vertical acceleration $a_y(t)$ is state-dependent:
$$a_y(t) = \begin{cases}
g \cdot \mu_{\text{fall}} = -26.0 \times 1.6 = -41.6\text{ m/s}^2 & \text{if } v_y(t) < 0 \quad (\text{Snappy Falling}) \\
g \cdot \mu_{\text{lowJump}} = -26.0 \times 2.2 = -57.2\text{ m/s}^2 & \text{if } v_y(t) > 0 \text{ and } \neg \text{JumpHeld} \quad (\text{Short Hop}) \\
g = -26.0\text{ m/s}^2 & \text{if } v_y(t) > 0 \text{ and } \text{JumpHeld} \quad (\text{Full Ascent})
\end{cases}$$

Integration step:
$$v_y(t + \Delta t) = v_y(t) + a_y(t) \cdot \Delta t$$
$$y(t + \Delta t) = y(t) + v_y(t + \Delta t) \cdot \Delta t$$

#### 2.5D Plane Constraint:
$$z(t) = 0.0, \quad \forall t$$
$$\text{If } |z(t) - 0.0| > 10^{-3} \implies z(t) \leftarrow 0.0$$

---

### 3.2 Trajectory Arcs & Projectile Mathematics

Used by the **Cinder-Bough Archer** flaming stakes and **Boss Vael-Krag** leaping slams.

For a projectile or leap launched from $(x_0, y_0, 0)$ with initial speed $v_0$ and launch angle $\theta$ relative to the horizontal:
$$v_{x0} = v_0 \cos \theta$$
$$v_{y0} = v_0 \sin \theta$$

Position as a function of time $t \ge 0$:
$$x(t) = x_0 + (v_0 \cos \theta) t$$
$$y(t) = y_0 + (v_0 \sin \theta) t - \frac{1}{2} |g| t^2$$
$$z(t) = 0$$

Peak arc apex height:
$$t_{\text{apex}} = \frac{v_0 \sin \theta}{|g|}$$
$$y_{\text{max}} = y_0 + \frac{v_0^2 \sin^2 \theta}{2 |g|}$$

Time to impact target at height $y_{\text{target}}$:
$$t_{\text{impact}} = \frac{v_0 \sin \theta + \sqrt{v_0^2 \sin^2 \theta + 2 |g| (y_0 - y_{\text{target}})}}{|g|}$$

---

### 3.3 Hitbox Geometry & Overlap Calculations

#### Sword Hitbox AABB / OBB:
Let the player position be $\vec{P} = (P_x, P_y, 0)$ and facing direction $F \in \{-1, +1\}$.
The sword hitbox center $\vec{C}_{\text{hit}}$ and half-extents $\vec{E}_{\text{hit}}$ are:
$$\vec{C}_{\text{hit}} = \begin{pmatrix} P_x + F \cdot 0.70 \\ P_y + 0.00 \\ 0.00 \end{pmatrix}, \quad \vec{E}_{\text{hit}} = \begin{pmatrix} 0.10 \\ 0.40 \\ 0.10 \end{pmatrix}$$

#### Character Capsule Hurtbox:
Segment between cylinder endpoints $\vec{A} = (x, y + 0.5, 0)$ and $\vec{B} = (x, y + 1.5, 0)$ with radius $R_{\text{cap}} = 0.5\text{ m}$.

#### 2.5D Overlap Condition:
In the 2.5D projection, horizontal reach $D_{\text{reach}} = 2.4\text{ m}$. Collision between attacker $\vec{P}_{\text{atk}}$ and target $\vec{P}_{\text{tgt}}$ is satisfied iff:
$$|P_{\text{tgt}, x} - P_{\text{atk}, x}| < D_{\text{reach}}$$
$$\text{and } |P_{\text{tgt}, y} - P_{\text{atk}, y}| < H_{\text{reach}} \quad (H_{\text{reach}} = 1.8\text{ m})$$
$$\text{and } \begin{cases} P_{\text{tgt}, x} > P_{\text{atk}, x} & \text{if } F = +1 \quad (\text{Facing Right}) \\ P_{\text{tgt}, x} < P_{\text{atk}, x} & \text{if } F = -1 \quad (\text{Facing Left}) \end{cases}$$

#### Stygian Lance Railgun Raycast:
A horizontal ray along $Y = P_y + 1.2\text{ m}$ extending distance $L_{\text{beam}} = 16.0\text{ m}$:
$$\text{Hit Condition: } \text{Target in Front} \land |P_{\text{tgt}, x} - P_{\text{atk}, x}| \le L_{\text{beam}} \land |P_{\text{tgt}, y} - (P_{\text{atk}, y} + 1.2)| \le 0.8\text{ m}$$

---

### 3.4 Damage Mitigation & Scaling Formulas

#### Attack Damage Profile:
$$D_{\text{raw}}(\text{attack}) = \begin{cases}
20 - 22 & \text{Combo Hit 1} \\
25 - 28 & \text{Combo Hit 2} \\
40 - 48 & \text{Combo Hit 3 (Finisher)} \\
55 & \text{Stygian Lance Spell (Crit)} \\
65 - 80 & \text{Heavy Cleave / Great-Mace} \\
15 - 20 & \text{Twin Dagger Fast Strike}
\end{cases}$$

#### Net Damage with Armor Mitigation:
$$D_{\text{net}} = D_{\text{raw}} \cdot \left(1 - \frac{\text{Armor}}{\text{Armor} + K_{\text{armor}}}\right)$$
Where $K_{\text{armor}} = 100$ is the standard soft-cap defense constant.

#### Parry & Shield Formulas:
$$D_{\text{net}} = \begin{cases}
0 & \text{if Perfect Parry executed within } [0, 0.10\text{ s}] \text{ window} \\
0 & \text{if Target has Frontal Shield (Iron Phalanx) and Hit is Light Melee} \\
D_{\text{raw}} \times 1.5 & \text{if Hit is Heavy Cleave on Shield (Shield Break)} \\
D_{\text{raw}} \times 2.5 & \text{if Target is in Stagger / Poise-Broken Riposte state}
\end{cases}$$

#### Knockback Impulse Vector:
$$\vec{u}_{\text{raw}} = \text{normalize}\left(\vec{P}_{\text{target}} - \vec{P}_{\text{source}}\right)$$
$$\vec{u}_{2.5D} = \text{normalize}\begin{pmatrix} \text{sign}(P_{\text{tgt}, x} - P_{\text{src}, x}) \\ 0.30 \\ 0.00 \end{pmatrix}$$
$$\vec{J}_{\text{knockback}} = \vec{u}_{2.5D} \cdot F_{\text{knockback}} \quad (F_{\text{knockback}} = 6.0\text{ N}\cdot\text{s})$$

---

### 3.5 Deterministic State Transition Functions

Let an enemy entity's state at time $t$ be $S(t) \in \{\text{IDLE}, \text{PATROL}, \text{AGGRO}, \text{ATTACK}, \text{STAGGER}, \text{DEAD}\}$.

The transition function $T: S(t) \times \text{Events} \to S(t + \Delta t)$ is given by:

$$S(t + \Delta t) = \begin{cases}
\text{DEAD} & \text{if } \text{HP} \le 0 \\
\text{STAGGER} & \text{if } \text{hitReceived} = \text{true} \lor \text{parryDeflected} = \text{true} \\
\text{ATTACK} & \text{if } S(t) \in \{\text{AGGRO}, \text{IDLE}\} \land d_{\text{player}} \le R_{\text{attack}} \land t_{\text{cooldown}} \le 0 \\
\text{AGGRO} & \text{if } S(t) \in \{\text{IDLE}, \text{PATROL}\} \land d_{\text{player}} \le R_{\text{aggro}} \land \text{LineOfSight} \\
\text{PATROL} & \text{if } S(t) = \text{IDLE} \land t_{\text{idle}} \ge T_{\text{idleMax}} \land \neg \text{CliffAhead} \\
\text{IDLE} & \text{if } S(t) = \text{PATROL} \land (\text{WaypointReached} \lor \text{CliffAhead})
\end{cases}$$

Parameter Thresholds:
- $R_{\text{aggro}} = 8.0 - 10.0\text{ m}$
- $R_{\text{attack}} = 1.8 - 2.2\text{ m}$ (Melee) or $12.0\text{ m}$ (Archer)
- $T_{\text{stagger}} = 0.15\text{ s}$ (Light hit) or $1.50\text{ s}$ (Poise broken)
- $T_{\text{telegraph}} = 0.30\text{ s}$ (White glint warning)

---

## 4. Edge Cases & Boundary Constraints

| # | Feature | Input / Condition | Observed / Documented Behavior | Constraint / Guard Rail |
|---|---------|-------------------|--------------------------------|-------------------------|
| 1 | 2.5D Plane Constraint | Physical collision pushes character off $Z = 0$ axis | Without constraint, character drifts into background/foreground, causing attacks to miss | `Enforce2DPlane()` strictly resets `position.z = 0` if $\|z\| > 10^{-3}$ |
| 2 | Jump Kinematics | Jump tapped $0.05\text{ s}$ before landing on platform | Normal jump logic would drop the input since player is still airborne | `jumpBufferCounter` stores request for $0.12\text{ s}$ and triggers jump upon landing |
| 3 | Jump Kinematics | Player walks off platform ledge without jumping | Player enters falling state immediately; normal jump logic would disallow jump | `coyoteTimeCounter` grants $0.12\text{ s}$ grace window allowing jump mid-air |
| 4 | Attack Hitbox | Weapon hitbox trigger stays overlapping enemy across multiple frames | Target could register multiple hits and take $5\times$ intended damage in one swing | `_hitObjectsThisSwing` HashSet tracks damaged entities and ignores repeated collisions |
| 5 | Hit-Stop Micro-Freeze | TimeScale set to `0.0f` to freeze game | Setting `Time.timeScale = 0f` causes zero-division in physics motors and breaks timers | Set `Time.timeScale = 0.05f` and wait using `WaitForSecondsRealtime(duration)` |
| 6 | Combo Chain | Player presses attack rapidly 10 times in 1 second | Spamming inputs could cause animators to desync or stack recursive attack coroutines | Guard `if (!_isAttacking)` or input lock until $0.08\text{ s}$ into recovery; input queue handles next strike cleanly |
| 7 | Combo Chain | Player waits $1.5\text{ s}$ between Hit 1 and Hit 2 | Player expects combo to continue, but reset window has expired | `comboResetTime` ($0.65\text{ s}$) resets `_currentComboIndex = 0`; next attack cleanly executes Hit 1 |
| 8 | Shadow Dodge Roll | Player presses dodge while already dodging | Multi-click could cause infinite velocity stacking or perpetual invincibility | `if (Player.isDodging) return;` prevents re-triggering until `dodgeTimer` reaches 0 |
| 9 | Stygian Lance Spell | Player activates spell with Resonance $= 15$ ($< 25$) | Spell fails to fire, no energy deducted, no beam spawned | Early return guard `if (Player.resonance < 25) return;` |
| 10 | Universal Health | Entity HP reduced below zero by massive overkill damage (e.g. $-50$) | Negative health could cause underflow or incorrect health bar rendering | `currentHealth = Mathf.Max(0f, currentHealth - amount);` clamps to 0; triggers `Die()` once |
| 11 | Post-Hit Invulnerability | Entity hit by 3 continuous damage triggers in $0.1\text{ s}$ | Multi-hit hazards would instakill entity in 3 frames | `_invulnerabilityTimer` ($0.3\text{ s}$) blocks subsequent damage while active |
| 12 | Enemy AI Patrol | Patrol entity reaches edge of elevated platform | Entity walks off edge, falls to death or breaks encounter spacing | Ledge detector raycast checks for missing floor; triggers turn-around to Idle/Patrol |
| 13 | Boss Phase Transition | Boss HP hits 50% while performing Bell Sweep attack | Abrupt state switch could cause animation snapping or hitbox ghosting | Boss finishes active attack recovery before executing Phase 2 bell-ignition transition |
| 14 | Camera Screen Shake | Massive critical hit triggers shake during existing shake | Stacking intensity could cause camera to violently displace off-screen | `shakeIntensity` is clamped; displacement is decayed exponentially; Z offset is zeroed |
| 15 | Checkpoint Shrine | Player stands inside checkpoint trigger indefinitely | Continuous trigger calls could cause health to heal every frame and spam logs | `_isActivated` boolean ensures checkpoint logic executes once per activation |
| 16 | High Fall Tunneling | Player falls at terminal velocity ($-40\text{ m/s}$) onto thin platform ($0.6\text{ m}$) | Discrete physics step might move player from $y=1.0$ to $y=-0.5$, bypassing platform | Swept collision or platform detection loop checks if path intersects platform top |

---

## 5. Architectural Subsystem Directory Mapping

| Subsystem | Canonical Unity Script Path | WebGL Equivalent Function/Object | Primary Responsibility |
|:---|:---|:---|:---|
| **Core Input** | `Assets/_Project/Scripts/Core/InputReader.cs` | `Keys`, `setupTouch()`, `window.addEventListener` | Cross-platform input translation |
| **Kinematics Motor** | `Assets/_Project/Scripts/Player/PlayerMotor.cs` | `Player`, `animate()` horizontal & jump physics | 2.5D kinematics, gravity, coyote/buffer |
| **Combat Controller** | `Assets/_Project/Scripts/Player/PlayerCombat.cs` | `doAttack()`, `Player.comboStep`, `swordPivot` | 3-hit combo, timing, recovery |
| **Magic System** | `Assets/_Project/Scripts/Player/PlayerMagic.cs` | `doSpell()`, Stygian Lance cylinder beam | Resonance consumption & projectile casting |
| **Hitbox Damage** | `Assets/_Project/Scripts/Combat/DamageDealer.cs` | Distance & front check in `doAttack()` | Hitbox activation & single-hit tracking |
| **Hurtbox & Knockback** | `Assets/_Project/Scripts/Combat/DamageReceiver.cs` | `dummyGroup.position.x += knockback` | Knockback calculation & Health routing |
| **Health & Invulnerability**| `Assets/_Project/Scripts/Combat/Health.cs` | `Player.hp`, `dummyHP` | HP tracking, I-frames, death handling |
| **Hit-Stop Micro-Freeze**| `Assets/_Project/Scripts/Combat/HitStopManager.cs` | `hitStopTimer` in `animate()` | Timescale reduction micro-freezes |
| **Enemy AI & State** | `Assets/_Project/Scripts/Enemies/EnemyAI.cs` | `dummyHP`, `dummyFlashTimer`, auto-revive | Deterministic state machine |
| **2.5D Camera Tracking** | `Assets/_Project/Scripts/Camera/CameraFollow2D5.cs` | `camera.position` tracking with look-ahead | Rail tracking, look-ahead, screen shake |
| **Audio Synthesizer** | N/A (AudioSource in Unity) | `AudioSys` (Web Audio API) | Real-time procedural audio synthesis |
| **Sanctuary Checkpoint** | `Assets/_Project/Scripts/Core/Checkpoint.cs` | `shrineGroup`, proximity check in loop | Respawn point, health restore, light VFX |
| **HUD & Interface** | `Assets/_Project/Scripts/UI/HealthBarHUD.cs` | `updateHUD()`, `#hp-bar`, `#res-bar` | Status bars, floating damage numbers |

---
**Report finalized and verified against all game documents and code assets.**
