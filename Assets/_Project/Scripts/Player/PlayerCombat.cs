using System.Collections;
using UnityEngine;
using Vaelthorn.CameraSystem;
using Vaelthorn.Combat;
using Vaelthorn.Core;

namespace Vaelthorn.Player
{
    /// <summary>
    /// PlayerCombat: Controls the 3-hit light attack combo system.
    /// Works with or without an Animator (includes procedural sword swings for Graybox testing).
    /// </summary>
    public class PlayerCombat : MonoBehaviour
    {
        [Header("Weapon Hitbox Reference")]
        [SerializeField] private DamageDealer weaponDamageDealer;
        [SerializeField] private Transform weaponTransform;

        [Header("Combo Configuration")]
        [Tooltip("Damage dealt by Hit 1, Hit 2, and Hit 3.")]
        [SerializeField] private float[] comboDamages = new float[] { 20f, 25f, 40f };

        [Tooltip("Duration of active swing window in seconds.")]
        [SerializeField] private float attackDuration = 0.22f;

        [Tooltip("Time window after an attack to continue the combo.")]
        [SerializeField] private float comboResetTime = 0.65f;

        [Header("Screen Shake Feedback")]
        [Tooltip("Screen shake intensity on the final finisher hit.")]
        [SerializeField] private float finisherShakeIntensity = 0.25f;

        private InputReader _input;
        private Animator _animator;
        private int _currentComboIndex = 0;
        private float _lastAttackTime = 0f;
        private bool _isAttacking = false;

        public bool IsAttacking => _isAttacking;
        public int CurrentComboIndex => _currentComboIndex;

        private void Start()
        {
            _input = InputReader.Instance;
            _animator = GetComponentInChildren<Animator>();

            if (weaponDamageDealer == null)
            {
                weaponDamageDealer = GetComponentInChildren<DamageDealer>();
            }
        }

        private void Update()
        {
            // Reset combo string if player waits too long between attacks
            if (_currentComboIndex > 0 && Time.time - _lastAttackTime > comboResetTime)
            {
                ResetCombo();
            }

            // Check for light attack input
            if (_input != null && _input.LightAttackPressed && !_isAttacking)
            {
                ExecuteAttack();
            }
        }

        private void ExecuteAttack()
        {
            _isAttacking = true;
            _lastAttackTime = Time.time;
            _currentComboIndex++;

            if (_currentComboIndex > 3)
            {
                _currentComboIndex = 1;
            }

            // Set damage corresponding to current combo step
            if (weaponDamageDealer != null)
            {
                float damage = comboDamages[Mathf.Clamp(_currentComboIndex - 1, 0, comboDamages.Length - 1)];
                weaponDamageDealer.SetDamage(damage);
            }

            // Trigger animation if present
            if (_animator != null)
            {
                _animator.SetTrigger($"Attack{_currentComboIndex}");
            }

            // Procedural sword animation & hitbox activation for grayboxing
            StartCoroutine(PerformAttackRoutine(_currentComboIndex));

            // Extra camera punch on finisher hit
            if (_currentComboIndex == 3)
            {
                CameraFollow2D5.Instance?.TriggerShake(finisherShakeIntensity, 0.18f);
            }
        }

        private IEnumerator PerformAttackRoutine(int comboStep)
        {
            // Enable weapon hitbox
            weaponDamageDealer?.EnableHitbox();

            // Procedural swing arc if weapon transform is assigned
            if (weaponTransform != null)
            {
                Quaternion startRot = weaponTransform.localRotation;
                float elapsed = 0f;
                float swingAngle = comboStep == 3 ? -110f : -70f;

                while (elapsed < attackDuration)
                {
                    float t = elapsed / attackDuration;
                    weaponTransform.localRotation = startRot * Quaternion.Euler(0f, 0f, swingAngle * Mathf.Sin(t * Mathf.PI));
                    elapsed += Time.deltaTime;
                    yield return null;
                }
                weaponTransform.localRotation = startRot;
            }
            else
            {
                yield return new WaitForSeconds(attackDuration);
            }

            // Disable weapon hitbox
            weaponDamageDealer?.DisableHitbox();
            _isAttacking = false;
        }

        public void ResetCombo()
        {
            _currentComboIndex = 0;
            _isAttacking = false;
        }
    }
}
