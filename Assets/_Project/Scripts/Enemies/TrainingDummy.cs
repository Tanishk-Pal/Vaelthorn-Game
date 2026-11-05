using System.Collections;
using UnityEngine;
using Vaelthorn.Combat;

namespace Vaelthorn.Enemies
{
    /// <summary>
    /// TrainingDummy: The perfect prototype test subject.
    /// Responds to attacks, flashes red on hit, tracks damage,
    /// and automatically revives after death so you can test combos indefinitely.
    /// </summary>
    [RequireComponent(typeof(Health), typeof(DamageReceiver))]
    public class TrainingDummy : MonoBehaviour
    {
        [Header("Visual Feedback")]
        [SerializeField] private Renderer dummyRenderer;
        [SerializeField] private Color damageFlashColor = Color.red;
        [SerializeField] private float flashDuration = 0.12f;

        [Header("Respawn")]
        [SerializeField] private float autoReviveDelay = 2.5f;

        private Health _health;
        private Color _originalColor;
        private Material _dummyMaterial;

        private void Awake()
        {
            _health = GetComponent<Health>();

            if (dummyRenderer != null)
            {
                _dummyMaterial = dummyRenderer.material;
                _originalColor = _dummyMaterial.color;
            }
        }

        private void OnEnable()
        {
            if (_health != null)
            {
                _health.OnDamaged += HandleDamaged;
                _health.OnDeath += HandleDeath;
            }
        }

        private void OnDisable()
        {
            if (_health != null)
            {
                _health.OnDamaged -= HandleDamaged;
                _health.OnDeath -= HandleDeath;
            }
        }

        private void HandleDamaged(float amount, Vector3 hitPoint)
        {
            Debug.Log($"<color=orange>[Training Dummy]</color> Took {amount} damage! Current HP: {_health.CurrentHealth}/{_health.MaxHealth}");
            if (_dummyMaterial != null)
            {
                StopAllCoroutines();
                StartCoroutine(FlashRoutine());
            }
        }

        private void HandleDeath()
        {
            Debug.Log("<color=red>[Training Dummy]</color> Defeated! Reviving in " + autoReviveDelay + "s...");
            StartCoroutine(ReviveRoutine());
        }

        private IEnumerator FlashRoutine()
        {
            _dummyMaterial.color = damageFlashColor;
            yield return new WaitForSeconds(flashDuration);
            _dummyMaterial.color = _originalColor;
        }

        private IEnumerator ReviveRoutine()
        {
            // Dim dummy during revival
            if (_dummyMaterial != null) _dummyMaterial.color = Color.gray;

            yield return new WaitForSeconds(autoReviveDelay);

            _health.ResetHealth();
            if (_dummyMaterial != null) _dummyMaterial.color = _originalColor;
            Debug.Log("<color=green>[Training Dummy]</color> Revived and ready for combat!");
        }
    }
}
