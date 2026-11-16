/**
 * End-of-rest signal generated with Web Audio (no audio files).
 *
 * Browsers, iOS in particular, only allow sound after the user has touched
 * the page. `unlockAudio` must therefore be called from a tap/click handler
 * (we do it when a set is marked as done); the beep itself can then be
 * played later from a timer. When sound is still blocked, `playRestEndSound`
 * reports it so the UI can say so instead of failing silently.
 */

let context: AudioContext | undefined;

function audioContext(): AudioContext | undefined {
  if (context === undefined && typeof AudioContext !== 'undefined') {
    try {
      context = new AudioContext();
    } catch {
      context = undefined;
    }
  }
  return context;
}

/** Call from a user gesture. Safe to call repeatedly. */
export function unlockAudio(): void {
  const audio = audioContext();
  if (audio?.state === 'suspended') {
    void audio.resume().catch(() => undefined);
  }
}

/**
 * Plays three short beeps.
 * @param volume 0–1
 * @returns `false` when the browser did not allow sound
 */
export function playRestEndSound(volume: number): boolean {
  const audio = audioContext();
  if (audio === undefined || audio.state !== 'running') {
    return false;
  }
  const gainValue = Math.min(1, Math.max(0, volume));
  for (let index = 0; index < 3; index += 1) {
    const start = audio.currentTime + index * 0.28;
    const oscillator = audio.createOscillator();
    const gain = audio.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.value = 880;
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(gainValue, start + 0.02);
    gain.gain.linearRampToValueAtTime(0, start + 0.18);
    oscillator.connect(gain).connect(audio.destination);
    oscillator.start(start);
    oscillator.stop(start + 0.2);
  }
  return true;
}
