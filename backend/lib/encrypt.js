import crypto from "node:crypto";
import { getPrivateKey, getPublicKey } from "./config.js";

export function encryptRSA(payload) {
	const encrypted = crypto.publicEncrypt(
		{
			key: getPublicKey(),
			padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
			oaepHash: "sha256",
		},
		Buffer.from(payload),
	);

	return encrypted.toString("base64");
}

export function decryptRSA(payload) {
	const decrypted = crypto.privateDecrypt(
		{
			key: getPrivateKey(),
			padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
			oaepHash: "sha256",
		},
		payload,
	);

	return decrypted.toString("utf8");
}
