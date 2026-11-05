using System.Collections;
using UnityEngine;

namespace Vaelthorn.Combat
{
    /// <summary>
    /// HitStopManager: Creates brief micro-pauses (freeze-frames) when heavy hits connect,
    /// delivering intense tactile feedback and combat impact.
    /// </summary>
    public class HitStopManager : MonoBehaviour
    {
        public static HitStopManager Instance { get; private set; }

        private bool _isHitStopping = false;

        private void Awake()
        {
            if (Instance != null && Instance != this)
            {
                Destroy(gameObject);
                return;
            }
            Instance = this;
        }

        public void RequestHitStop(float duration)
        {
            if (_isHitStopping) return;
            StartCoroutine(PerformHitStop(duration));
        }

        private IEnumerator PerformHitStop(float duration)
        {
            _isHitStopping = true;
            float originalTimeScale = Time.timeScale;
            
            // Slow time to near-stop (0.05 instead of 0 to avoid zero-division in physics)
            Time.timeScale = 0.05f;

            // Wait using real-world unscaled time
            yield return new WaitForSecondsRealtime(duration);

            Time.timeScale = originalTimeScale;
            _isHitStopping = false;
        }
    }
}
