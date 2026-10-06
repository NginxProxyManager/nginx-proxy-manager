/**
 * A software WebAuthn authenticator for API tests.
 *
 * Behaves like a security key without a PIN: P-256 keys, "none" attestation, user presence
 * only and a signature counter. It takes the JSON options NPM's sign-in pages receive and
 * returns the JSON responses those pages send back, for a given origin.
 */

import crypto from "node:crypto";

const b64url = (buf) => Buffer.from(buf).toString("base64url");
const sha256 = (data) => crypto.createHash("sha256").update(data).digest();

// Minimal CBOR encoder: unsigned/negative integers, byte strings, text strings and maps
const cborHead = (major, value) => {
	if (value < 24) {
		return Buffer.from([(major << 5) | value]);
	}
	if (value < 0x100) {
		return Buffer.from([(major << 5) | 24, value]);
	}
	if (value < 0x10000) {
		const buf = Buffer.alloc(3);
		buf[0] = (major << 5) | 25;
		buf.writeUInt16BE(value, 1);
		return buf;
	}
	const buf = Buffer.alloc(5);
	buf[0] = (major << 5) | 26;
	buf.writeUInt32BE(value, 1);
	return buf;
};

const cbor = (value) => {
	if (Buffer.isBuffer(value)) {
		return Buffer.concat([cborHead(2, value.length), value]);
	}
	if (typeof value === "string") {
		const bytes = Buffer.from(value, "utf8");
		return Buffer.concat([cborHead(3, bytes.length), bytes]);
	}
	if (typeof value === "number") {
		return value >= 0 ? cborHead(0, value) : cborHead(1, -1 - value);
	}
	if (value instanceof Map) {
		const parts = [cborHead(5, value.size)];
		for (const [k, v] of value) {
			parts.push(cbor(k), cbor(v));
		}
		return Buffer.concat(parts);
	}
	throw new Error(`Can't CBOR encode ${typeof value}`);
};

const counterBytes = (counter) => {
	const buf = Buffer.alloc(4);
	buf.writeUInt32BE(counter, 0);
	return buf;
};

export class SoftAuthenticator {
	constructor() {
		this.credentials = new Map();
	}

	/**
	 * navigator.credentials.create()
	 *
	 * @param {Object} options  PublicKeyCredentialCreationOptionsJSON
	 * @param {String} origin   e.g. https://app.example.com
	 * @returns {Object}        RegistrationResponseJSON
	 */
	create(options, origin) {
		const { privateKey, publicKey } = crypto.generateKeyPairSync("ec", { namedCurve: "P-256" });
		const id = crypto.randomBytes(32);
		const rpId = options.rp.id;
		const jwk = publicKey.export({ format: "jwk" });

		const coseKey = new Map([
			[1, 2], // kty: EC2
			[3, -7], // alg: ES256
			[-1, 1], // crv: P-256
			[-2, Buffer.from(jwk.x, "base64url")],
			[-3, Buffer.from(jwk.y, "base64url")],
		]);

		const idLength = Buffer.alloc(2);
		idLength.writeUInt16BE(id.length, 0);
		const authData = Buffer.concat([
			sha256(rpId),
			Buffer.from([0x41]), // user present, attested credential data
			counterBytes(0),
			Buffer.alloc(16), // AAGUID
			idLength,
			id,
			cbor(coseKey),
		]);

		const clientDataJSON = Buffer.from(
			JSON.stringify({ type: "webauthn.create", challenge: options.challenge, origin, crossOrigin: false }),
		);
		const attestationObject = cbor(
			new Map([
				["fmt", "none"],
				["attStmt", new Map()],
				["authData", authData],
			]),
		);

		this.credentials.set(b64url(id), { privateKey, rpId, counter: 0 });

		return {
			id: b64url(id),
			rawId: b64url(id),
			type: "public-key",
			response: {
				clientDataJSON: b64url(clientDataJSON),
				attestationObject: b64url(attestationObject),
				transports: ["nfc", "usb"],
			},
			clientExtensionResults: {},
		};
	}

	/**
	 * navigator.credentials.get()
	 *
	 * @param {Object} options  PublicKeyCredentialRequestOptionsJSON
	 * @param {String} origin   e.g. https://app.example.com
	 * @returns {Object}        AuthenticationResponseJSON
	 */
	get(options, origin) {
		const allowed = (options.allowCredentials || []).map((c) => c.id);
		const id = allowed.find((credId) => this.credentials.has(credId));
		if (!id) {
			throw new Error("NotAllowedError: none of the allowed credentials are on this authenticator");
		}
		const credential = this.credentials.get(id);
		credential.counter += 1;

		const authData = Buffer.concat([
			sha256(options.rpId || credential.rpId),
			Buffer.from([0x01]), // user present
			counterBytes(credential.counter),
		]);
		const clientDataJSON = Buffer.from(
			JSON.stringify({ type: "webauthn.get", challenge: options.challenge, origin, crossOrigin: false }),
		);
		const signature = crypto.sign("sha256", Buffer.concat([authData, sha256(clientDataJSON)]), credential.privateKey);

		return {
			id,
			rawId: id,
			type: "public-key",
			response: {
				clientDataJSON: b64url(clientDataJSON),
				authenticatorData: b64url(authData),
				signature: b64url(signature),
			},
			clientExtensionResults: {},
		};
	}

	/**
	 * Only keep one credential, to act as a different physical key
	 *
	 * @param {String} id
	 * @returns {SoftAuthenticator}
	 */
	only(id) {
		const other = new SoftAuthenticator();
		other.credentials.set(id, this.credentials.get(id));
		return other;
	}
}
