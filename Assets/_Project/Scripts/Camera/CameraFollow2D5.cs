using UnityEngine;

namespace Vaelthorn.CameraSystem
{
    /// <summary>
    /// CameraFollow2D5: Follows the player along the 2D plane (X and Y),
    /// maintains locked depth (Z), includes forward look-ahead anticipation,
    /// and provides smooth camera shake for combat impacts.
    /// </summary>
    public class CameraFollow2D5 : MonoBehaviour
    {
        public static CameraFollow2D5 Instance { get; private set; }

        [Header("Target Tracking")]
        [SerializeField] private Transform target;
        [SerializeField] private Vector2 offset = new Vector2(0f, 1.8f);
        [SerializeField] private float smoothTime = 0.18f;

        [Header("2.5D Depth & Framing")]
        [Tooltip("Fixed camera distance on Z.")]
        [SerializeField] private float lockedZDistance = -12f;

        [Tooltip("Downward tilt angle in degrees to show ground depth.")]
        [SerializeField] private float tiltAngleX = 5f;

        [Header("Look-Ahead")]
        [Tooltip("How far the camera shifts ahead of the player while running.")]
        [SerializeField] private float lookAheadDistance = 1.5f;

        // Internal State
        private Vector3 _currentVelocity;
        private float _shakeIntensity = 0f;
        private float _shakeTimer = 0f;

        private void Awake()
        {
            if (Instance != null && Instance != this)
            {
                Destroy(gameObject);
                return;
            }
            Instance = this;

            // Apply default 2.5D tilt angle
            transform.rotation = Quaternion.Euler(tiltAngleX, 0f, 0f);
        }

        private void LateUpdate()
        {
            if (target == null) return;

            // Compute target position on X and Y
            float targetX = target.position.x + offset.x;
            float targetY = target.position.y + offset.y;

            // Look-ahead based on target forward/facing direction
            float facingDir = target.forward.x > 0 ? 1f : -1f;
            targetX += facingDir * lookAheadDistance;

            Vector3 destination = new Vector3(targetX, targetY, lockedZDistance);

            // Smooth position interpolation
            Vector3 smoothedPos = Vector3.SmoothDamp(transform.position, destination, ref _currentVelocity, smoothTime);

            // Apply camera shake if active
            if (_shakeTimer > 0f)
            {
                Vector3 shakeOffset = Random.insideUnitSphere * _shakeIntensity;
                shakeOffset.z = 0f; // Shake primarily on X and Y
                smoothedPos += shakeOffset;
                _shakeTimer -= Time.deltaTime;
            }

            transform.position = smoothedPos;
        }

        public void SetTarget(Transform newTarget) => target = newTarget;

        public void TriggerShake(float intensity, float duration)
        {
            _shakeIntensity = intensity;
            _shakeTimer = duration;
        }
    }
}
