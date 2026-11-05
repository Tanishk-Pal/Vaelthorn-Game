using System;
using UnityEngine;

namespace Vaelthorn.Combat
{
    /// <summary>
    /// Health: Reusable health and damage system for both Player and Enemies.
    /// Manages HP, invincibility frames (I-frames), and triggers events for UI and animations.
    /// </summary>
    public class Health : MonoBehaviour
    {
        [Header("Health Values")]
        [SerializeField] private float maxHealth = 100f;
        [SerializeField] private float currentHealth;

        [Header("Invulnerability (I-Frames)")]
        [Tooltip("Seconds of invulnerability after receiving a hit.")]
        [SerializeField] private float invulnerabilityDuration = 0.3f;
        private float _invulnerabilityTimer;

        // Public Events
        public event Action<float, float> OnHealthChanged; // (current, max)
        public event Action<float, Vector3> OnDamaged;      // (amount, hitPoint)
        public event Action<float> OnHealed;
        public event Action OnDeath;

        public float CurrentHealth => currentHealth;
        public float MaxHealth => maxHealth;
        public bool IsDead => currentHealth <= 0f;
        public bool IsInvulnerable => _invulnerabilityTimer > 0f;

        private void Awake()
        {
            currentHealth = maxHealth;
        }

        private void Update()
        {
            if (_invulnerabilityTimer > 0f)
            {
                _invulnerabilityTimer -= Time.deltaTime;
            }
        }

        public void TakeDamage(float amount, Vector3 hitSourcePosition, float knockbackForce = 0f)
        {
            if (IsDead || IsInvulnerable) return;

            currentHealth = Mathf.Max(0f, currentHealth - amount);
            _invulnerabilityTimer = invulnerabilityDuration;

            OnDamaged?.Invoke(amount, hitSourcePosition);
            OnHealthChanged?.Invoke(currentHealth, maxHealth);

            if (currentHealth <= 0f)
            {
                Die();
            }
        }

        public void Heal(float amount)
        {
            if (IsDead) return;

            currentHealth = Mathf.Min(maxHealth, currentHealth + amount);
            OnHealed?.Invoke(amount);
            OnHealthChanged?.Invoke(currentHealth, maxHealth);
        }

        public void ResetHealth()
        {
            currentHealth = maxHealth;
            _invulnerabilityTimer = 0f;
            OnHealthChanged?.Invoke(currentHealth, maxHealth);
        }

        private void Die()
        {
            OnDeath?.Invoke();
        }
    }
}
