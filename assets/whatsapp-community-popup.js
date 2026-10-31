const STORAGE_KEY_DISMISSED = 'nesovi:whatsapp-popup:dismissed';
const STORAGE_KEY_SESSION_CLOSED = 'nesovi:whatsapp-popup:session-closed';

/**
 * @param {Storage} store
 * @returns {boolean}
 */
function isStorageUsable(store) {
  try {
    const testKey = '__nesovi_storage_test__';
    store.setItem(testKey, '1');
    store.removeItem(testKey);
    return true;
  } catch {
    return false;
  }
}

const canUseLocalStorage = isStorageUsable(window.localStorage);
const canUseSessionStorage = isStorageUsable(window.sessionStorage);

function isDismissedForever() {
  return canUseLocalStorage && window.localStorage.getItem(STORAGE_KEY_DISMISSED) === '1';
}

function isClosedThisSession() {
  return canUseSessionStorage && window.sessionStorage.getItem(STORAGE_KEY_SESSION_CLOSED) === '1';
}

async function init() {
  const popup = document.getElementById('whatsapp-community-popup');
  if (!popup) return;

  if (isDismissedForever() || isClosedThisSession()) return;

  await customElements.whenDefined('dialog-component');

  const dismissButton = popup.querySelector('[data-whatsapp-popup-dismiss]');
  const joinLink = popup.querySelector('[data-whatsapp-popup-join]');

  dismissButton?.addEventListener('click', () => {
    if (canUseLocalStorage) window.localStorage.setItem(STORAGE_KEY_DISMISSED, '1');
    popup.closeDialog();
  });

  joinLink?.addEventListener('click', () => {
    if (canUseLocalStorage) window.localStorage.setItem(STORAGE_KEY_DISMISSED, '1');
  });

  popup.addEventListener('dialog:close', () => {
    if (canUseSessionStorage) window.sessionStorage.setItem(STORAGE_KEY_SESSION_CLOSED, '1');
  });

  const delay = Number(popup.dataset.delay) || 3000;

  window.setTimeout(() => {
    if (isDismissedForever() || isClosedThisSession()) return;
    popup.showDialog();
  }, delay);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
