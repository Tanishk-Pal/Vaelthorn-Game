# Original User Request

## Approved Task Prompt — 2026-11-01T02:33:57Z

Divide tasks into small chunks across the team then plan before coding to develop the 2.5D dark fantasy action-adventure RPG "Vaelthorn: The Oath of Darkness" into a playable, production-ready game. The team may decide the implementation platform, utilizing either the existing Unity (C#) project in the working directory or the standalone 3D WebGL/HTML5 prototype.

Working directory: E:\Vaelthorn
Integrity mode: development

Reference material:
- Game Design Document: E:\Vaelthorn\Docs\GDD_Vaelthorn.md
- Technical Architecture: E:\Vaelthorn\Docs\Technical_Plan_Vaelthorn.md
- Core C# Scripts: E:\Vaelthorn\Assets\_Project\Scripts\
- Playable HTML5 Prototype: E:\Vaelthorn\Vaelthorn_Playable_Prototype.html

## Requirements

### R1. Playable Game Production Build
Deliver a playable, production-ready build of Vaelthorn implementing the core game loop, player controls, enemy combat encounters, and visual/audio feedback. The team decides the primary target architecture (expanding the Unity C# project or enhancing the standalone 3D WebGL build) to ensure immediate playability and robust stability.

### R2. Mathematical Game Algorithms
Design and implement core game systems using explicit mathematical models for kinematics, trajectory arcs, combat hitboxes, damage mitigation/scaling formulas, and enemy AI state machines as specified in the technical documentation.

### R3. Character Mechanics & Combat System
Implement the playable protagonist Kaelen (The Eclipse-Bound) featuring fluid movement kinematics, a 3-hit attack combo, hit-stop feedback, parry timing windows, shadow dodge roll, Stygian Resonance resource accumulation and expenditure, and the Stygian Lance spell.

### R4. Enemy Behaviors and Combat Encounters
Implement enemy entities governed by deterministic state machines (idle, patrol, aggro/pursuit, attack execution, hit reaction, defeat), including a boss or elite encounter that tests the combat loop mechanics.

## Acceptance Criteria

### Playable Build & Stability
- [ ] The game builds and executes without unhandled runtime exceptions or crash-inducing errors.
- [ ] The player can control Kaelen to navigate the environment, engage enemies, and complete a combat encounter from start to finish.

### Combat & Character Mechanics
- [ ] Kaelen's 3-hit attack combo executes with responsive input buffering and proper combo reset windows.
- [ ] Parrying within the designated timing window deflects incoming attacks and triggers counter-attack opportunities.
- [ ] Attacking and taking damage correctly increments and drains the Stygian Resonance gauge, enabling the Stygian Lance spell upon sufficient charge.
- [ ] Successful hits trigger hit-stop feedback and kinematic knockback according to the combat specification.

### Mathematical Systems & State Machines
- [ ] Programmatic unit tests verify kinematics, hitbox overlap calculations, damage scaling, and trajectory math across valid ranges without NaN or infinite values.
- [ ] Enemy AI state machines reliably transition between idle, patrol, aggro, attack, hit-reaction, and death states across multiple encounter runs.

## Verification Resources
- Existing documentation and references in `E:\Vaelthorn\Docs\`.
- Programmatic test suite covering mathematical algorithms, state transitions, and damage calculations.
- Playtest script or runner verifying the end-to-end playable encounter flow.
