/**
 * Crypto module - all cryptographic operations using Web Crypto API
 * - PBKDF2 for key derivation from master password
 * - AES-GCM for symmetric encryption of vault data
 */

const PBKDF2_ITERATIONS = 310000; // OWASP recommended minimum
const SALT_LENGTH = 32;
const IV_LENGTH = 12;
const KEY_LENGTH = 256;

/**
 * Derive an AES-GCM key from a master password using PBKDF2
 */
async function deriveKey(masterPassword, salt) {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(masterPassword),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: KEY_LENGTH },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypt plaintext with AES-GCM, returns { iv, ciphertext } as base64 strings
 */
async function encrypt(key, plaintext) {
  const encoder = new TextEncoder();
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoder.encode(plaintext)
  );
  return {
    iv: bufferToBase64(iv),
    ciphertext: bufferToBase64(ciphertext),
  };
}

/**
 * Decrypt AES-GCM ciphertext
 */
async function decrypt(key, iv, ciphertext) {
  const decoder = new TextDecoder();
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: base64ToBuffer(iv) },
    key,
    base64ToBuffer(ciphertext)
  );
  return decoder.decode(plaintext);
}

/**
 * Generate a cryptographically secure random salt
 */
function generateSalt() {
  return crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
}

/**
 * Compute SHA-256 hash of master password + salt for vault verification
 */
async function hashPassword(masterPassword, salt) {
  const encoder = new TextEncoder();
  const data = encoder.encode(masterPassword + bufferToBase64(salt));
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return bufferToBase64(hashBuffer);
}

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

/**
 * Generate a strong random password
 */
function generatePassword(options = {}) {
  const {
    length = 20,
    uppercase = true,
    lowercase = true,
    numbers = true,
    symbols = true,
  } = options;

  const UPPER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const LOWER = 'abcdefghijklmnopqrstuvwxyz';
  const NUMS = '0123456789';
  const SYMS = '!@#$%^&*()_+-=[]{}|;:,.<>?';

  let charset = '';
  const required = [];

  if (uppercase) { charset += UPPER; required.push(UPPER); }
  if (lowercase) { charset += LOWER; required.push(LOWER); }
  if (numbers)   { charset += NUMS;  required.push(NUMS); }
  if (symbols)   { charset += SYMS;  required.push(SYMS); }

  if (!charset) throw new Error('At least one character type must be selected');

  // Ensure at least one char from each required set
  const passwordChars = required.map(set =>
    set[randomInt(set.length)]
  );

  // Fill remaining length with random chars from full charset
  while (passwordChars.length < length) {
    passwordChars.push(charset[randomInt(charset.length)]);
  }

  // Shuffle using Fisher-Yates with crypto random
  for (let i = passwordChars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [passwordChars[i], passwordChars[j]] = [passwordChars[j], passwordChars[i]];
  }

  return passwordChars.join('');
}

/**
 * Cryptographically secure random integer in [0, max)
 */
function randomInt(max) {
  const array = new Uint32Array(1);
  let result;
  do {
    crypto.getRandomValues(array);
    result = array[0];
  } while (result >= Math.floor(0xFFFFFFFF / max) * max);
  return result % max;
}

/**
 * Check password strength, returns { score: 0-4, label, color }
 */
function checkStrength(password) {
  let score = 0;
  if (password.length >= 12) score++;
  if (password.length >= 16) score++;
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;

  const levels = [
    { label: 'Very Weak', color: '#ef4444' },
    { label: 'Weak',      color: '#f97316' },
    { label: 'Fair',      color: '#eab308' },
    { label: 'Strong',    color: '#22c55e' },
    { label: 'Very Strong', color: '#16a34a' },
  ];

  return { score, ...levels[Math.min(score, 4)] };
}
