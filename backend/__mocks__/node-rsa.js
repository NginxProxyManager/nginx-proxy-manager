/**
 * Minimal stub for node-rsa — used when the real package's dependencies
 * (asn1, etc.) are not installed in the test environment.
 */
export default class NodeRSA {
	constructor() {}
	generateKeyPair() { return this; }
	exportKey() { return "-----BEGIN RSA KEY-----\nMOCK\n-----END RSA KEY-----"; }
	importKey() { return this; }
	sign() { return Buffer.from("mock-signature"); }
	verify() { return true; }
	encrypt() { return Buffer.from("mock-encrypted"); }
	decrypt() { return Buffer.from("mock-decrypted"); }
}
