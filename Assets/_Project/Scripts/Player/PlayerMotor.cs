using UnityEngine;
using Vaelthorn.Core;

namespace Vaelthorn.Player
{
    /// <summary>
    /// PlayerMotor: Handles all 2.5D movement, gravity, jumping, and facing direction.
    /// Strictly locks the character to the Z = 0 plane so they never slip into the background.
    /// Includes AAA game-feel features: Coyote Time and Jump Buffering.
    /// </summary>
    [RequireComponent(typeof(CharacterController))]
    public class PlayerMotor : MonoBehaviour
    {
        [Header("Movement Speeds")]
        [Tooltip("Horizontal movement speed in meters per second.")]
        [SerializeField] private float moveSpeed = 8.5f;

        [Tooltip("How fast the character turns to face left or right.")]
        [SerializeField] private float turnSpeed = 15f;

        [Header("Jumping & Gravity")]
        [Tooltip("Peak height of a full jump.")]
        [SerializeField] private float jumpHeight = 2.4f;

        [Tooltip("Custom downward gravity force.")]
        [SerializeField] private float gravity = -26f;

        [Tooltip("Gravity multiplier when falling (makes jumps feel snappy, not floaty).")]
        [SerializeField] private float fallMultiplier = 1.6f;

        [Tooltip("Gravity multiplier if the player releases jump early (low hop).")]
        [SerializeField] private float lowJumpMultiplier = 2.2f;

        [Header("Game-Feel Timers (Coyote & Buffer)")]
        [Tooltip("Grace period in seconds allowing a jump after walking off a ledge.")]
        [SerializeField] private float coyoteTimeDuration = 0.12f;

        [Tooltip("Window in seconds to remember a jump press before touching the ground.")]
        [SerializeField] private float jumpBufferDuration = 0.12f;

        [Header("Ground Detection")]
        [SerializeField] private Transform groundCheck;
        [SerializeField] private float groundCheckRadius = 0.25f;
        [SerializeField] private LayerMask groundLayer;

        [Header("2.5D Plane Constraint")]
        [Tooltip("The fixed Z coordinate for gameplay. Keeps character on the 2D plane.")]
        [SerializeField] private float lockedZPosition = 0f;

        // Components & State
        private CharacterController _controller;
        private InputReader _input;
        private Vector3 _velocity;
        private bool _isGrounded;
        private float _coyoteTimeCounter;
        private float _jumpBufferCounter;
        private bool _isFacingRight = true;

        public bool IsGrounded => _isGrounded;
        public bool IsFacingRight => _isFacingRight;
        public Vector3 Velocity => _controller.velocity;

        private void Awake()
        {
            _controller = GetComponent<CharacterController>();
        }

        private void Start()
        {
            _input = InputReader.Instance;
            if (_input == null)
            {
                Debug.LogWarning("InputReader instance not found in scene. Adding one automatically.");
                _input = gameObject.AddComponent<InputReader>();
            }
        }

        private void Update()
        {
            CheckGround();
            HandleTimers();
            HandleHorizontalMovement();
            HandleJumpAndGravity();
            ApplyMovement();
            Enforce2DPlane();
        }

        private void CheckGround()
        {
            if (groundCheck != null)
            {
                _isGrounded = Physics.CheckSphere(groundCheck.position, groundCheckRadius, groundLayer);
            }
            else
            {
                // Fallback to CharacterController's built-in flag if no groundCheck object assigned
                _isGrounded = _controller.isGrounded;
            }

            if (_isGrounded && _velocity.y < 0f)
            {
                // Small downward push ensures CharacterController stays glued to slopes and flat ground
                _velocity.y = -2f;
            }
        }

        private void HandleTimers()
        {
            // Coyote Time: reset while grounded, drain when airborne
            if (_isGrounded)
            {
                _coyoteTimeCounter = coyoteTimeDuration;
            }
            else
            {
                _coyoteTimeCounter -= Time.deltaTime;
            }

            // Jump Buffer: store jump request when pressed
            if (_input.JumpPressed)
            {
                _jumpBufferCounter = jumpBufferDuration;
            }
            else
            {
                _jumpBufferCounter -= Time.deltaTime;
            }
        }

        private void HandleHorizontalMovement()
        {
            float horizontalInput = _input.Horizontal;

            // Apply horizontal velocity
            _velocity.x = horizontalInput * moveSpeed;

            // Face movement direction
            if (horizontalInput > 0.1f && !_isFacingRight)
            {
                FlipFacing(true);
            }
            else if (horizontalInput < -0.1f && _isFacingRight)
            {
                FlipFacing(false);
            }
        }

        private void HandleJumpAndGravity()
        {
            // Execute Jump if buffer and coyote time are valid
            if (_jumpBufferCounter > 0f && _coyoteTimeCounter > 0f)
            {
                // Physics formula for exact jump height: v = sqrt(2 * g * h)
                _velocity.y = Mathf.Sqrt(jumpHeight * -2f * gravity);
                _jumpBufferCounter = 0f;
                _coyoteTimeCounter = 0f;
            }

            // Snappy falling physics
            if (_velocity.y < 0f)
            {
                // Falling downward: apply faster gravity
                _velocity.y += gravity * fallMultiplier * Time.deltaTime;
            }
            else if (_velocity.y > 0f && !_input.JumpHeld)
            {
                // Player released jump button early: cut jump height short
                _velocity.y += gravity * lowJumpMultiplier * Time.deltaTime;
            }
            else
            {
                // Standard upward jump arc
                _velocity.y += gravity * Time.deltaTime;
            }
        }

        private void ApplyMovement()
        {
            // Move character using CharacterController
            _controller.Move(_velocity * Time.deltaTime);
        }

        private void Enforce2DPlane()
        {
            // Absolute lock to Z = lockedZPosition to prevent any physics drift in 2.5D
            if (Mathf.Abs(transform.position.z - lockedZPosition) > 0.001f)
            {
                Vector3 correctedPos = transform.position;
                correctedPos.z = lockedZPosition;
                transform.position = correctedPos;
            }
        }

        private void FlipFacing(bool faceRight)
        {
            _isFacingRight = faceRight;
            // Face 90 degrees on Y for Right, -90 (or 270) for Left
            float targetYRotation = _isFacingRight ? 90f : -90f;
            transform.rotation = Quaternion.Euler(0f, targetYRotation, 0f);
        }

        private void OnDrawGizmosSelected()
        {
            if (groundCheck != null)
            {
                Gizmos.color = _isGrounded ? Color.green : Color.red;
                Gizmos.DrawWireSphere(groundCheck.position, groundCheckRadius);
            }
        }
    }
}
