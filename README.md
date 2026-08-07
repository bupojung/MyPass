# MyPass

Monorepo scaffold for the MyPass password manager.

Packages:
- packages/shared-crypto: TypeScript library with key derivation + AEAD encrypt/decrypt (initial PBKDF2 + AES-GCM fallback). Replace with Argon2/libsodium in production.
- packages/mobile: React Native (Expo) skeleton demonstrating use of shared-crypto.
- packages/backend: Fastify/TypeScript minimal API skeleton for vault storage (stores ciphertext only).
- packages/extension: Chrome extension skeleton (Manifest V3) for popup and content script.

Branch note: scaffold pushed to a new branch `init-scaffold`. Merge into your default branch when ready.

Quick start (requires pnpm):
1) pnpm install
2) pnpm -w run build

See each package README for package-specific instructions.
