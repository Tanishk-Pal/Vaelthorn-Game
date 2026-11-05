using UnityEngine;
using System;

namespace Vaelthorn.Core
{
    /// <summary>
    /// InputReader: Central hub for all player input.
    /// Works out of the box with standard keyboard & mouse, and provides
    /// hooks for gamepads and Android on-screen virtual buttons.
    /// </summary>
    public class InputReader : MonoBehaviour
    {
        public static InputReader Instance { get; private set; }

        [Header("Movement")]
        public float Horizontal { get; private set; }
        public float Vertical { get; private set; }
        public Vector2 MoveVector => new Vector2(Horizontal, Vertical);

        [Header("Action Flags")]
        public bool JumpPressed { get; private set; }
        public bool JumpHeld { get; private set; }
        public bool LightAttackPressed { get; private set; }
        public bool HeavyAttackPressed { get; private set; }
        public bool DodgePressed { get; private set; }
        public bool CastSpellPressed { get; private set; }
        public bool InteractPressed { get; private set; }

        // Virtual Touch Override (Used by Android Touch Controls)
        private float _virtualHorizontal = 0f;
        private bool _virtualJump = false;
        private bool _virtualAttack = false;
        private bool _virtualDodge = false;
        private bool _virtualCast = false;

        private void Awake()
        {
            if (Instance != null && Instance != this)
            {
                Destroy(gameObject);
                return;
            }
            Instance = this;
        }

        private void Update()
        {
            ReadInputs();
        }

        private void ReadInputs()
        {
            // 1. Horizontal Movement (A/D, Left/Right Arrow, or Android Virtual Stick)
            float rawHorizontal = Input.GetAxisRaw("Horizontal");
            Horizontal = Mathf.Abs(_virtualHorizontal) > 0.01f ? _virtualHorizontal : rawHorizontal;

            // 2. Vertical Movement (W/S, Up/Down Arrow)
            Vertical = Input.GetAxisRaw("Vertical");

            // 3. Jump (Spacebar or Android Jump Button)
            JumpPressed = Input.GetKeyDown(KeyCode.Space) || _virtualJump;
            JumpHeld = Input.GetKey(KeyCode.Space);

            // 4. Combat Actions
            // Left Mouse Button or 'J' key for Light Attack
            LightAttackPressed = Input.GetMouseButtonDown(0) || Input.GetKeyDown(KeyCode.J) || _virtualAttack;
            
            // Hold / Right Click / 'U' key for Spells
            CastSpellPressed = Input.GetMouseButtonDown(1) || Input.GetKeyDown(KeyCode.U) || _virtualCast;

            // Left Shift or 'L' key for Dodge Roll
            DodgePressed = Input.GetKeyDown(KeyCode.LeftShift) || Input.GetKeyDown(KeyCode.L) || _virtualDodge;

            // 'E' key for World Interaction (Checkpoints, NPCs)
            InteractPressed = Input.GetKeyDown(KeyCode.E);

            // Reset one-frame virtual triggers
            _virtualJump = false;
            _virtualAttack = false;
            _virtualDodge = false;
            _virtualCast = false;
        }

        // Methods for Android On-Screen UI Buttons to trigger actions
        public void SetVirtualHorizontal(float value) => _virtualHorizontal = Mathf.Clamp(value, -1f, 1f);
        public void TriggerVirtualJump() => _virtualJump = true;
        public void TriggerVirtualAttack() => _virtualAttack = true;
        public void TriggerVirtualDodge() => _virtualDodge = true;
        public void TriggerVirtualCast() => _virtualCast = true;
    }
}
