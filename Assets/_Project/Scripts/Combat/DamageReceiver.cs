using UnityEngine;

namespace Vaelthorn.Combat
{
    /// <summary>
    /// DamageReceiver: Attached to characters (Player or Enemies) to receive hits from a DamageDealer.
    /// Passes the damage to the Health component and applies directional knockback.
    /// </summary>
    [RequireComponent(typeof(Health))]
    public class DamageReceiver : MonoBehaviour
    {
        private Health _health;
        private CharacterController _characterController;
        private Rigidbody _rigidbody;

        private void Awake()
        {
            _health = GetComponent<Health>();
            _characterController = GetComponent<CharacterController>();
            _rigidbody = GetComponent<Rigidbody>();
        }

        public void ReceiveHit(float damage, Vector3 hitSourcePosition, float knockbackForce)
        {
            if (_health == null || _health.IsDead) return;

            _health.TakeDamage(damage, hitSourcePosition, knockbackForce);

            // Apply horizontal knockback away from hit source along the 2.5D plane
            Vector3 knockbackDir = (transform.position - hitSourcePosition).normalized;
            knockbackDir.z = 0f; // strictly keep knockback along X and Y
            knockbackDir.y = 0.3f; // slight upward pop

            if (_rigidbody != null && !_rigidbody.isKinematic)
            {
                _rigidbody.AddForce(knockbackDir * knockbackForce, ForceMode.Impulse);
            }
            else if (_characterController != null)
            {
                // Simple knockback push for CharacterController
                StartCoroutine(ApplyControllerKnockback(knockbackDir * knockbackForce));
            }
        }

        private System.Collections.IEnumerator ApplyControllerKnockback(Vector3 force)
        {
            float elapsed = 0f;
            float duration = 0.15f;
            while (elapsed < duration)
            {
                _characterController.Move(force * Time.deltaTime);
                elapsed += Time.deltaTime;
                yield return null;
            }
        }
    }
}
