import fs from "node:fs";
import path from "node:path";
import { CREDENTIALS_DIR, PROVIDERS_DIR, decrypt, encrypt } from "./crypto.js";

export const ensureCredentialDirs = () => {
	fs.mkdirSync(CREDENTIALS_DIR, { recursive: true, mode: 0o700 });
	fs.mkdirSync(PROVIDERS_DIR, { recursive: true, mode: 0o700 });
};

/**
 * @param {number} id
 * @returns {string}
 */
export const getCredentialPath = (id) => path.join(CREDENTIALS_DIR, `${id}.enc`);

/**
 * @param {number} id
 * @param {string} plaintext
 */
export const writeCredentialFile = (id, plaintext) => {
	ensureCredentialDirs();
	const { buffer, keyId } = encrypt(plaintext);
	const target = getCredentialPath(id);
	const temp = `${target}.tmp`;
	fs.writeFileSync(temp, buffer, { mode: 0o600 });
	fs.renameSync(temp, target);
	return { storagePath: `${id}.enc`, keyId };
};

/**
 * @param {number} id
 * @returns {string}
 */
export const readCredentialFile = (id) => {
	const filePath = getCredentialPath(id);
	if (!fs.existsSync(filePath)) {
		throw new Error(`Credential file not found for id ${id}`);
	}
	return decrypt(fs.readFileSync(filePath));
};

/**
 * @param {number} id
 */
export const deleteCredentialFile = (id) => {
	const filePath = getCredentialPath(id);
	if (fs.existsSync(filePath)) {
		fs.unlinkSync(filePath);
	}
};

/**
 * @param {number} certificateId
 * @param {string} plaintext
 */
export const writeCertbotCredentialsFile = (certificateId, plaintext) => {
	const credentialsLocation = `/etc/letsencrypt/credentials/credentials-${certificateId}`;
	fs.mkdirSync("/etc/letsencrypt/credentials", { recursive: true });
	fs.writeFileSync(credentialsLocation, plaintext, { mode: 0o600 });
	return credentialsLocation;
};
