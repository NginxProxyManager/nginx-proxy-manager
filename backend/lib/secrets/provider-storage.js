import fs from "node:fs";
import path from "node:path";
import { PROVIDERS_DIR, decrypt, encrypt } from "./crypto.js";

export const writeProviderSecret = (providerId, plaintext) => {
	fs.mkdirSync(PROVIDERS_DIR, { recursive: true, mode: 0o700 });
	const { buffer } = encrypt(plaintext);
	const target = path.join(PROVIDERS_DIR, `${providerId}.enc`);
	const temp = `${target}.tmp`;
	fs.writeFileSync(temp, buffer, { mode: 0o600 });
	fs.renameSync(temp, target);
	return `${providerId}.enc`;
};

export const readProviderSecret = (providerId) => {
	const filePath = path.join(PROVIDERS_DIR, `${providerId}.enc`);
	if (!fs.existsSync(filePath)) {
		return null;
	}
	return decrypt(fs.readFileSync(filePath));
};

export const deleteProviderSecret = (providerId) => {
	const filePath = path.join(PROVIDERS_DIR, `${providerId}.enc`);
	if (fs.existsSync(filePath)) {
		fs.unlinkSync(filePath);
	}
};
