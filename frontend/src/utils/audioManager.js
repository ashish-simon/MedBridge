// Global Audio Manager for MediKiosk to guarantee single-voice playback with zero overlay

let activeAudioInstance = null;
let globalPlayId = 0;

/**
 * Immediately stops any currently playing audio across the entire application
 * and invalidates all pending play promises.
 */
export const stopGlobalAudio = () => {
  globalPlayId = Date.now();
  if (activeAudioInstance) {
    try {
      activeAudioInstance.pause();
      activeAudioInstance.currentTime = 0;
      activeAudioInstance.onended = null;
      activeAudioInstance.onerror = null;
      activeAudioInstance.src = "";
    } catch (e) {}
    activeAudioInstance = null;
  }
};

/**
 * Returns the latest global play token ID.
 */
export const getGlobalPlayId = () => globalPlayId;

/**
 * Plays Bhashini base64 audio with strict single-instance management.
 * @param {string} audioBase64 - Raw base64 string or data URL.
 * @param {function} onEnded - Callback when playback finishes cleanly.
 * @param {function} onError - Callback if playback fails.
 * @returns {number} The playId assigned for this playback session.
 */
export const playGlobalAudio = (audioBase64, onEnded = null, onError = null) => {
  stopGlobalAudio();
  const playId = globalPlayId;

  if (!audioBase64 || typeof audioBase64 !== 'string') {
    if (onEnded) onEnded();
    return playId;
  }

  let srcUrl = audioBase64;
  if (!srcUrl.startsWith('data:')) {
    // Detect WAV header ('UklGR') vs MP3 default
    const mime = srcUrl.startsWith('UklGR') ? 'audio/wav' : 'audio/mp3';
    srcUrl = `data:${mime};base64,${srcUrl}`;
  }

  try {
    const snd = new Audio(srcUrl);
    activeAudioInstance = snd;

    snd.onended = () => {
      if (globalPlayId === playId) {
        if (activeAudioInstance === snd) activeAudioInstance = null;
        if (onEnded) onEnded();
      }
    };

    snd.onerror = (err) => {
      if (globalPlayId === playId) {
        if (activeAudioInstance === snd) activeAudioInstance = null;
        if (onError) onError(err);
      }
    };

    const playPromise = snd.play();
    if (playPromise !== undefined) {
      playPromise
        .then(() => {
          // If another request or stop audio was called while play() was pending, pause immediately
          if (globalPlayId !== playId) {
            try {
              snd.pause();
              snd.currentTime = 0;
              snd.src = "";
            } catch (e) {}
          }
        })
        .catch((err) => {
          console.log("Audio play policy or cancellation notice:", err);
          if (globalPlayId === playId && onError) {
            onError(err);
          }
        });
    }
  } catch (err) {
    console.error("Audio creation error:", err);
    if (onError) onError(err);
  }

  return playId;
};
