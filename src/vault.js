/**
 * Vault module - manages encrypted password storage
 * All vault operations require an unlocked (derived) key in memory.
 */

const STORAGE_KEY = 'mypass_vault';

/**
 * Initialize a new vault with a master password.
 * Generates a new salt and encrypts an empty entry list.
 */
async function initVault(masterPassword) {
  const salt = generateSalt();
  const key = await deriveKey(masterPassword, salt);
  const verificationHash = await hashPassword(masterPassword, salt);

  const emptyVault = { entries: [] };
  const { iv, ciphertext } = await encrypt(key, JSON.stringify(emptyVault));

  const stored = {
    salt: bufferToBase64(salt),
    verificationHash,
    iv,
    ciphertext,
    createdAt: Date.now(),
  };

  await chrome.storage.local.set({ [STORAGE_KEY]: stored });
  return key;
}

/**
 * Unlock vault with master password. Returns derived key if successful.
 * Throws if password is wrong or vault does not exist.
 */
async function unlockVault(masterPassword) {
  const stored = await getStoredVault();
  if (!stored) throw new Error('NO_VAULT');

  const salt = base64ToBuffer(stored.salt);
  const key = await deriveKey(masterPassword, new Uint8Array(salt));

  // Verify password before attempting decryption
  const hash = await hashPassword(masterPassword, new Uint8Array(salt));
  if (hash !== stored.verificationHash) throw new Error('WRONG_PASSWORD');

  // Verify we can actually decrypt (defense in depth)
  await decrypt(key, stored.iv, stored.ciphertext);

  return key;
}

/**
 * Check if a vault exists in storage
 */
async function vaultExists() {
  const stored = await getStoredVault();
  return stored !== null;
}

/**
 * Read all entries from the vault
 */
async function readEntries(key) {
  const stored = await getStoredVault();
  if (!stored) throw new Error('NO_VAULT');
  const plaintext = await decrypt(key, stored.iv, stored.ciphertext);
  const vault = JSON.parse(plaintext);
  return vault.entries || [];
}

/**
 * Write entries back to vault (re-encrypts with new IV)
 */
async function writeEntries(key, entries) {
  const stored = await getStoredVault();
  if (!stored) throw new Error('NO_VAULT');

  const vault = { entries };
  const { iv, ciphertext } = await encrypt(key, JSON.stringify(vault));

  await chrome.storage.local.set({
    [STORAGE_KEY]: { ...stored, iv, ciphertext },
  });
}

/**
 * Add a new entry to the vault
 */
async function addEntry(key, entry) {
  const entries = await readEntries(key);
  const newEntry = {
    id: generateId(),
    ...entry,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  entries.push(newEntry);
  await writeEntries(key, entries);
  return newEntry;
}

/**
 * Update an existing entry
 */
async function updateEntry(key, id, updates) {
  const entries = await readEntries(key);
  const index = entries.findIndex(e => e.id === id);
  if (index === -1) throw new Error('Entry not found');
  entries[index] = { ...entries[index], ...updates, updatedAt: Date.now() };
  await writeEntries(key, entries);
  return entries[index];
}

/**
 * Delete an entry from the vault
 */
async function deleteEntry(key, id) {
  const entries = await readEntries(key);
  const filtered = entries.filter(e => e.id !== id);
  await writeEntries(key, filtered);
}

/**
 * Change master password - re-derives key, re-encrypts vault
 */
async function changeMasterPassword(oldKey, newMasterPassword) {
  const entries = await readEntries(oldKey);
  const stored = await getStoredVault();

  const newSalt = generateSalt();
  const newKey = await deriveKey(newMasterPassword, newSalt);
  const newVerificationHash = await hashPassword(newMasterPassword, newSalt);
  const { iv, ciphertext } = await encrypt(newKey, JSON.stringify({ entries }));

  await chrome.storage.local.set({
    [STORAGE_KEY]: {
      ...stored,
      salt: bufferToBase64(newSalt),
      verificationHash: newVerificationHash,
      iv,
      ciphertext,
    },
  });

  return newKey;
}

async function getStoredVault() {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  return result[STORAGE_KEY] || null;
}

function generateId() {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return Array.from(array, b => b.toString(16).padStart(2, '0')).join('');
}

// Re-export crypto helpers needed here
function bufferToBase64(buffer) {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)));
}

function base64ToBuffer(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}
