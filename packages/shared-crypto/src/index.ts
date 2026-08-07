// Lightweight shared-crypto initial implementation using Web Crypto (PBKDF2 + AES-GCM).
// NOTE: This is an initial scaffold. For production, replace PBKDF2 with Argon2id and AES-GCM
// with XChaCha20-Poly1305 (libsodium) for improved security and cross-platform compatibility.

export async function generateSalt(length = 16): Promise<Uint8Array> {
  const salt = new Uint8Array(length);
  crypto.getRandomValues(salt);
  return salt;
}

export function encodeBase64(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function decodeBase64(base64: string): Uint8Array {
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const passKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );
  // Iteration count is intentionally high for demo but tune for platform constraints.
  const key = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: 200000,
      hash: 'SHA-256'
    },
    passKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
  return key;
}

export async function encrypt(plaintext: string, key: CryptoKey): Promise<{ ciphertext: string; iv: string }>{
  const enc = new TextEncoder();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    enc.encode(plaintext)
  );
  return { ciphertext: encodeBase64(ct), iv: encodeBase64(iv) };
}

export async function decrypt(ciphertextB64: string, ivB64: string, key: CryptoKey): Promise<string> {
  const dec = new TextDecoder();
  const ct = decodeBase64(ciphertextB64);
  const iv = decodeBase64(ivB64);
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct.buffer);
  return dec.decode(plain);
}
