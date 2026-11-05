using UnityEngine;
using Vaelthorn.Combat;

namespace Vaelthorn.Core
{
    /// <summary>
    /// Checkpoint: Dark fantasy rest shrine / obelisk.
    /// When the player passes by or interacts, it saves the respawn position,
    /// heals the player to full HP, and ignites an ambient light.
    /// </summary>
    public class Checkpoint : MonoBehaviour
    {
        public static Vector3 LastCheckpointPosition { get; private set; }

        [Header("Visual Feedback")]
        [SerializeField] private Light shrineLight;
        [SerializeField] private Color activeColor = new Color(0.2f, 0.7f, 1f); // Radiant Starlight Blue
        [SerializeField] private ParticleSystem activationParticles;

        private bool _isActivated = false;

        private void OnTriggerEnter(Collider other)
        {
            if (_isActivated) return;

            // Check if player touched the checkpoint
            if (other.CompareTag("Player") || other.GetComponent<Player.PlayerMotor>() != null)
            {
                ActivateCheckpoint(other.gameObject);
            }
        }

        private void ActivateCheckpoint(GameObject player)
        {
            _isActivated = true;
            LastCheckpointPosition = transform.position;

            // Heal player to max health
            if (player.TryGetComponent<Health>(out var playerHealth))
            {
                playerHealth.Heal(playerHealth.MaxHealth);
            }

            // Visual activation
            if (shrineLight != null)
            {
                shrineLight.color = activeColor;
                shrineLight.intensity *= 2f;
            }

            if (activationParticles != null)
            {
                activationParticles.Play();
            }

            Debug.Log("<color=cyan>[Checkpoint Activated]</color> Sanctuary reached! Health restored and respawn saved.");
        }
    }
}
