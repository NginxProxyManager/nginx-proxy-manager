import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const KEY_LENGTH = 32;
const CURRENT_KEY_ID = "v1";

const secretsKeyFile = "/data/keys/secrets.json";

const getMasterKey = () => {
	const envKey = process.env.NPM_SECRETS_ENCRYPTION_KEY;
	if (envKey) {
		const buf = Buffer.from(envKey, "base64");
		if (buf.length !== KEY_LENGTH) {
			throw new Error("NPM_SECRETS_ENCRYPTION_KEY must be 32 bytes (base64-encoded)");
		}
		return { key: buf, keyId: CURRENT_KEY_ID };
	}

	if (fs.existsSync(secretsKeyFile)) {
		const data = JSON.parse(fs.readFileSync(secretsKeyFile, "utf8"));
		const key = Buffer.from(data.key, "base64");
		if (key.length !== KEY_LENGTH) {
			throw new Error("Invalid master key in secrets.json");
		}
		return { key, keyId: data.keyId || CURRENT_KEY_ID };
	}

	fs.mkdirSync(path.dirname(secretsKeyFile), { recursive: true, mode: 0o700 });
	const key = crypto.randomBytes(KEY_LENGTH);
	const payload = {
		keyId: CURRENT_KEY_ID,
		key: key.toString("base64"),
		created: new Date().toISOString(),
	};
	fs.writeFileSync(secretsKeyFile, JSON.stringify(payload, null, 2), { mode: 0o600 });
	return { key, keyId: CURRENT_KEY_ID };
};

/**
 * @param {string} plaintext
 * @returns {{ buffer: Buffer, keyId: string }}
 */
export const encrypt = (plaintext) => {
	const { key, keyId } = getMasterKey();
	const iv = crypto.randomBytes(IV_LENGTH);
	const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
	const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
	const tag = cipher.getAuthTag();
	const buffer = Buffer.concat([
		Buffer.from([1]),
		Buffer.from(keyId, "utf8"),
		Buffer.from([0]),
		iv,
		tag,
		encrypted,
	]);
	return { buffer, keyId };
};

/**
 * @param {Buffer} buffer
 * @returns {string}
 */
export const decrypt = (buffer) => {
	if (buffer[0] !== 1) {
		throw new Error("Unsupported credential encryption format");
	}
	const keyIdEnd = buffer.indexOf(0, 1);
	const keyId = buffer.subarray(1, keyIdEnd).toString("utf8");
	const ivStart = keyIdEnd + 1;
	const iv = buffer.subarray(ivStart, ivStart + IV_LENGTH);
	const tag = buffer.subarray(ivStart + IV_LENGTH, ivStart + IV_LENGTH + 16);
	const encrypted = buffer.subarray(ivStart + IV_LENGTH + 16);

	const envKey = process.env.NPM_SECRETS_ENCRYPTION_KEY;
	let key;
	if (envKey) {
		key = Buffer.from(envKey, "base64");
	} else if (fs.existsSync(secretsKeyFile)) {
		const data = JSON.parse(fs.readFileSync(secretsKeyFile, "utf8"));
		if (data.keyId !== keyId) {
			throw new Error(`Unknown encryption key id: ${keyId}`);
		}
		key = Buffer.from(data.key, "base64");
	} else {
		throw new Error("No master encryption key available");
	}

	const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
	decipher.setAuthTag(tag);
	return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
};

export const CREDENTIALS_DIR = "/data/credentials";
export const PROVIDERS_DIR = "/data/credentials/providers";
