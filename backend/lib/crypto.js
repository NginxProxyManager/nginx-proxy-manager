/**
 * OIDC Crypto Utility
 *
 * Provides AES-256-GCM encryption/decryption for OIDC client secrets.
 * The symmetric key is derived from the application's RSA private key using
 * HKDF (HMAC-based Key Derivation Function) with a fixed purpose label.
 *
 * IMPORTANT: If the RSA private key is rotated (e.g., /data/keys.json is deleted
 * and regenerated), all encrypted OIDC client secrets will become unreadable.
 * After RSA key rotation, you must re-save your OIDC configuration in the admin UI.
 */

import crypto from "node:crypto";
import { getPrivateKey } from "./config.js";

const PURPOSE_LABEL = "oidc-secret-encryption";
const KEY_LENGTH = 32; // 256 bits for AES-256
const IV_LENGTH = 12;  // 96 bits for GCM (NIST recommended)

/**
 * Derive a stable AES-256 key from the RSA private key using HKDF.
 * HKDF is purpose-bound, ensuring keys derived for different purposes are independent.
 *
 * @returns {Buffer} 32-byte AES key
 */
function deriveKey() {
	const privateKey = getPrivateKey();
	if (!privateKey) {
		throw new Error("RSA private key not available for OIDC secret encryption");
	}

	// Use HKDF to derive a purpose-bound key from the RSA key material
	// This is more robust than raw SHA-256 hashing
	return crypto.hkdfSync(
		"sha256",
		Buffer.from(privateKey, "utf8"),
		Buffer.alloc(0), // salt: empty (key material already has high entropy)
		Buffer.from(PURPOSE_LABEL, "utf8"),
		KEY_LENGTH,
	);
}

/**
 * Encrypt a plaintext string using AES-256-GCM.
 * Returns a base64-encoded string of format: iv:ciphertext:tag
 *
 * @param {string} plaintext
 * @returns {string} base64-encoded encrypted blob
 */
function encryptSecret(plaintext) {
	if (!plaintext) {
		return plaintext;
	}

	const key = deriveKey();
	const iv = crypto.randomBytes(IV_LENGTH);
	const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);

	const encrypted = Buffer.concat([
		cipher.update(plaintext, "utf8"),
		cipher.final(),
	]);

	const tag = cipher.getAuthTag();

	// Encode as: base64(iv) : base64(ciphertext) : base64(tag)
	return `${iv.toString("base64")}:${encrypted.toString("base64")}:${tag.toString("base64")}`;
}

/**
 * Decrypt an encrypted string produced by encryptSecret().
 *
 * @param {string} encrypted base64-encoded encrypted blob
 * @returns {string} decrypted plaintext
 * @throws {Error} if decryption fails (wrong key, tampered data, etc.)
 */
function decryptSecret(encrypted) {
	if (!encrypted) {
		return encrypted;
	}

	const parts = encrypted.split(":");
	if (parts.length !== 3) {
		throw new Error("Invalid encrypted secret format");
	}

	const [ivBase64, ciphertextBase64, tagBase64] = parts;
	const key = deriveKey();
	const iv = Buffer.from(ivBase64, "base64");
	const ciphertext = Buffer.from(ciphertextBase64, "base64");
	const tag = Buffer.from(tagBase64, "base64");

	const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
	decipher.setAuthTag(tag);

	try {
		const decrypted = Buffer.concat([
			decipher.update(ciphertext),
			decipher.final(),
		]);
		return decrypted.toString("utf8");
	} catch {
		throw new Error("Failed to decrypt OIDC client secret — possible key rotation or data corruption");
	}
}

export { encryptSecret, decryptSecret };
