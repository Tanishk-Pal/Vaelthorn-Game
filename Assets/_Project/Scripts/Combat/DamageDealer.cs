using System.Collections.Generic;
using UnityEngine;

namespace Vaelthorn.Combat
{
    /// <summary>
    /// DamageDealer: Placed on a weapon collider or spell projectile.
    /// Deals damage when its 3D trigger collides with an object carrying a DamageReceiver.
    /// Tracks hit targets to ensure one swing only damages a target once.
    /// </summary>
    public class DamageDealer : MonoBehaviour
    {
        [Header("Damage Settings")]
        [SerializeField] private float damage = 25f;
        [SerializeField] private float knockbackForce = 6f;

        [Tooltip("Which layers can this weapon harm? (e.g. Enemy or Player)")]
        [SerializeField] private LayerMask targetLayers;

        [Header("Hit-Stop Feedback")]
        [Tooltip("Brief micro-freeze duration in seconds on hit.")]
        [SerializeField] private float hitStopDuration = 0.05f;

        private Collider _triggerCollider;
        private readonly HashSet<Collider> _hitObjectsThisSwing = new HashSet<Collider>();
        private bool _canDealDamage = false;

        private void Awake()
        {
            _triggerCollider = GetComponent<Collider>();
            if (_triggerCollider != null)
            {
                _triggerCollider.isTrigger = true;
                _triggerCollider.enabled = false;
            }
        }

        public void SetDamage(float newDamage) => damage = newDamage;

        /// <summary>
        /// Enable weapon hitbox during the active swing frames.
        /// </summary>
        public void EnableHitbox()
        {
            _hitObjectsThisSwing.Clear();
            _canDealDamage = true;
            if (_triggerCollider != null)
            {
                _triggerCollider.enabled = true;
            }
        }

        /// <summary>
        /// Disable weapon hitbox after swing completes.
        /// </summary>
        public void DisableHitbox()
        {
            _canDealDamage = false;
            _hitObjectsThisSwing.Clear();
            if (_triggerCollider != null)
            {
                _triggerCollider.enabled = false;
            }
        }

        private void OnTriggerEnter(Collider other)
        {
            if (!_canDealDamage) return;

            // Check layer
            if ((targetLayers.value & (1 << other.gameObject.layer)) == 0) return;

            // Prevent hitting the same enemy multiple times in one swing
            if (_hitObjectsThisSwing.Contains(other)) return;
            _hitObjectsThisSwing.Add(other);

            // Attempt to damage target via DamageReceiver
            if (other.TryGetComponent<DamageReceiver>(out var receiver))
            {
                receiver.ReceiveHit(damage, transform.position, knockbackForce);
                TriggerHitStop(hitStopDuration);
            }
        }

        private void TriggerHitStop(float duration)
        {
            if (duration <= 0f) return;
            // HitStopController (or Coroutine micro-freeze)
            HitStopManager.Instance?.RequestHitStop(duration);
        }
    }
}
