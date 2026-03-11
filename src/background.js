/**
 * Background service worker
 * Holds the derived encryption key in memory while the vault is unlocked.
 * The key is automatically cleared when the service worker is terminated.
 */

// In-memory session state (cleared when SW terminates)
let sessionKey = null;
let lockTimer = null;
const AUTO_LOCK_MS = 15 * 60 * 1000; // 15 minutes

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  handleMessage(message).then(sendResponse).catch(err => {
    sendResponse({ error: err.message });
  });
  return true; // keep message channel open for async response
});

async function handleMessage(message) {
  switch (message.type) {
    case 'IS_LOCKED':
      return { locked: sessionKey === null };

    case 'SET_KEY':
      // Key is transferred as a CryptoKey object via structured clone
      sessionKey = message.key;
      resetLockTimer();
      return { ok: true };

    case 'GET_KEY':
      if (!sessionKey) throw new Error('LOCKED');
      resetLockTimer();
      return { key: sessionKey };

    case 'LOCK':
      sessionKey = null;
      clearLockTimer();
      return { ok: true };

    case 'PING':
      // Keep SW alive and reset lock timer
      if (sessionKey) resetLockTimer();
      return { ok: true };

    default:
      throw new Error('Unknown message type');
  }
}

function resetLockTimer() {
  clearLockTimer();
  lockTimer = setTimeout(() => {
    sessionKey = null;
    lockTimer = null;
  }, AUTO_LOCK_MS);
}

function clearLockTimer() {
  if (lockTimer !== null) {
    clearTimeout(lockTimer);
    lockTimer = null;
  }
}
