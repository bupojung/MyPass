# packages/shared-crypto

This package contains a minimal reference implementation for key-derivation and AEAD encryption.

Important notes:
- This scaffold uses PBKDF2 + AES-GCM via Web Crypto for simplicity. For production you should:
  - Use Argon2id for key derivation (argon2) with tuned parameters.
  - Use libsodium (XChaCha20-Poly1305) for AEAD encryption where possible.
- The implementation is intentionally small so it can be audited and replaced.
