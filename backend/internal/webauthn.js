import {
	generateRegistrationOptions,
	verifyRegistrationResponse,
	generateAuthenticationOptions,
	verifyAuthenticationResponse,
} from "@simplewebauthn/server";
import errs from "../lib/error.js";
import TokenModel from "../models/token.js";
import userModel from "../models/user.js";
import webauthnCredentialModel from "../models/webauthn_credential.js";

/**
 * Derive WebAuthn relying party settings from the request.
 * Environment variables override auto-detection if set.
 *
 * @param   {Object}  req  Express request object
 * @returns {{ rpID: string, rpName: string, origin: string }}
 */
const getRP = (req) => {
	const rpID = process.env.WEBAUTHN_RP_ID || req.hostname;
	const rpName = process.env.WEBAUTHN_RP_NAME || "Nginx Proxy Manager";
	const origin = process.env.WEBAUTHN_ORIGIN
		|| req.get("origin")
		|| `${req.protocol}://${req.get("host")}`;
	return { rpID, rpName, origin };
};

const internalWebauthn = {
	/**
	 * Generate registration options for a user
	 *
	 * @param   {Access}  access
	 * @param   {number}  userId
	 * @param   {Object}  req  Express request object
	 * @returns {Promise<{options: Object, challenge_token: string}>}
	 */
	generateRegOptions: async (access, userId, req) => {
		await access.can("users:password", userId);

		const user = await userModel
			.query()
			.where("id", userId)
			.andWhere("is_deleted", 0)
			.first();

		if (!user) {
			throw new errs.ItemNotFoundError("User not found");
		}

		const existingCreds = await webauthnCredentialModel
			.query()
			.where("user_id", userId)
			.andWhere("is_deleted", 0);

		const { rpID, rpName } = getRP(req);

		const options = await generateRegistrationOptions({
			rpName,
			rpID,
			userName: user.email,
			userDisplayName: user.name || user.nickname || user.email,
			excludeCredentials: existingCreds.map((cred) => ({
				id: cred.credential_id,
				transports: cred.transports || [],
			})),
			authenticatorSelection: {
				residentKey: "preferred",
				userVerification: "preferred",
			},
		});

		const Token = TokenModel();
		const challengeToken = await Token.create({
			iss: "api",
			attrs: {
				challenge: options.challenge,
				userId: userId,
			},
			scope: ["webauthn-reg-challenge"],
			expiresIn: "5m",
		});

		return {
			options,
			challenge_token: challengeToken.token,
		};
	},

	/**
	 * Verify registration response and store credential
	 *
	 * @param   {Access}  access
	 * @param   {number}  userId
	 * @param   {string}  challengeToken
	 * @param   {Object}  credential
	 * @param   {string}  friendlyName
	 * @param   {Object}  req  Express request object
	 * @returns {Promise<Object>}
	 */
	verifyRegistration: async (access, userId, challengeToken, credential, friendlyName, req) => {
		await access.can("users:password", userId);

		const Token = TokenModel();
		let tokenData;
		try {
			tokenData = await Token.load(challengeToken);
		} catch {
			throw new errs.AuthError("Invalid or expired challenge token");
		}

		if (!tokenData.scope || tokenData.scope[0] !== "webauthn-reg-challenge") {
			throw new errs.AuthError("Invalid challenge token");
		}

		if (tokenData.attrs?.userId !== userId) {
			throw new errs.AuthError("Challenge token does not match user");
		}

		const expectedChallenge = tokenData.attrs?.challenge;
		if (!expectedChallenge) {
			throw new errs.AuthError("Invalid challenge token");
		}

		const { rpID, origin } = getRP(req);

		let verification;
		try {
			verification = await verifyRegistrationResponse({
				response: credential,
				expectedChallenge,
				expectedOrigin: origin,
				expectedRPID: rpID,
			});
		} catch (err) {
			throw new errs.AuthError(`Registration verification failed: ${err.message}`);
		}

		if (!verification.verified || !verification.registrationInfo) {
			throw new errs.AuthError("Registration verification failed");
		}

		const { credential: regCredential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo;

		const record = await webauthnCredentialModel.query().insertAndFetch({
			user_id: userId,
			credential_id: regCredential.id,
			public_key: Buffer.from(regCredential.publicKey).toString("base64url"),
			counter: regCredential.counter,
			transports: credential.response?.transports || [],
			device_type: credentialDeviceType,
			backed_up: credentialBackedUp ? 1 : 0,
			friendly_name: friendlyName || "",
		});

		return {
			id: record.id,
			friendly_name: record.friendly_name,
			created_on: record.created_on,
			device_type: record.device_type,
			backed_up: record.backed_up,
		};
	},

	/**
	 * Generate authentication options
	 *
	 * @param   {string|null}  email  Optional email to filter credentials
	 * @param   {Object}       req    Express request object
	 * @returns {Promise<{options: Object, challenge_token: string}>}
	 */
	generateAuthOptions: async (email, req) => {
		const { rpID } = getRP(req);

		let allowCredentials;
		if (email) {
			const user = await userModel
				.query()
				.where("email", email.toLowerCase().trim())
				.andWhere("is_deleted", 0)
				.andWhere("is_disabled", 0)
				.first();

			if (!user) {
				throw new errs.AuthError("Invalid credentials");
			}

			const creds = await webauthnCredentialModel
				.query()
				.where("user_id", user.id)
				.andWhere("is_deleted", 0);

			if (creds.length === 0) {
				throw new errs.AuthError("No passkeys registered for this account");
			}

			allowCredentials = creds.map((cred) => ({
				id: cred.credential_id,
				transports: cred.transports || [],
			}));
		}

		const options = await generateAuthenticationOptions({
			rpID,
			userVerification: "preferred",
			...(allowCredentials ? { allowCredentials } : {}),
		});

		const Token = TokenModel();
		const challengeToken = await Token.create({
			iss: "api",
			attrs: {
				challenge: options.challenge,
			},
			scope: ["webauthn-auth-challenge"],
			expiresIn: "5m",
		});

		return {
			options,
			challenge_token: challengeToken.token,
		};
	},

	/**
	 * Verify authentication response
	 *
	 * @param   {string}  challengeToken
	 * @param   {Object}  credential
	 * @param   {Object}  req  Express request object
	 * @returns {Promise<number>}  userId
	 */
	verifyAuthentication: async (challengeToken, credential, req) => {
		const Token = TokenModel();
		let tokenData;
		try {
			tokenData = await Token.load(challengeToken);
		} catch {
			throw new errs.AuthError("Invalid or expired challenge token");
		}

		if (!tokenData.scope || tokenData.scope[0] !== "webauthn-auth-challenge") {
			throw new errs.AuthError("Invalid challenge token");
		}

		const expectedChallenge = tokenData.attrs?.challenge;
		if (!expectedChallenge) {
			throw new errs.AuthError("Invalid challenge token");
		}

		// Look up credential by ID
		const dbCredential = await webauthnCredentialModel
			.query()
			.where("credential_id", credential.id)
			.andWhere("is_deleted", 0)
			.first();

		if (!dbCredential) {
			throw new errs.AuthError("Passkey not recognized");
		}

		// Verify the user is active
		const user = await userModel
			.query()
			.where("id", dbCredential.user_id)
			.andWhere("is_deleted", 0)
			.andWhere("is_disabled", 0)
			.first();

		if (!user) {
			throw new errs.AuthError("User account is not available");
		}

		const { rpID, origin } = getRP(req);

		let verification;
		try {
			verification = await verifyAuthenticationResponse({
				response: credential,
				expectedChallenge,
				expectedOrigin: origin,
				expectedRPID: rpID,
				credential: {
					id: dbCredential.credential_id,
					publicKey: Buffer.from(dbCredential.public_key, "base64url"),
					counter: dbCredential.counter,
					transports: dbCredential.transports || [],
				},
			});
		} catch (err) {
			throw new errs.AuthError(`Passkey verification failed: ${err.message}`);
		}

		if (!verification.verified) {
			throw new errs.AuthError("Passkey verification failed");
		}

		// Update counter
		await webauthnCredentialModel
			.query()
			.findById(dbCredential.id)
			.patch({ counter: verification.authenticationInfo.newCounter });

		return user.id;
	},

	/**
	 * List passkeys for a user
	 *
	 * @param   {Access}  access
	 * @param   {number}  userId
	 * @returns {Promise<Array>}
	 */
	list: async (access, userId) => {
		await access.can("users:password", userId);

		const creds = await webauthnCredentialModel
			.query()
			.where("user_id", userId)
			.andWhere("is_deleted", 0)
			.orderBy("created_on", "desc");

		return creds.map((cred) => ({
			id: cred.id,
			friendly_name: cred.friendly_name,
			created_on: cred.created_on,
			device_type: cred.device_type,
			backed_up: cred.backed_up,
		}));
	},

	/**
	 * Rename a passkey
	 *
	 * @param   {Access}  access
	 * @param   {number}  userId
	 * @param   {number}  credentialId
	 * @param   {string}  friendlyName
	 * @returns {Promise<Object>}
	 */
	rename: async (access, userId, credentialId, friendlyName) => {
		await access.can("users:password", userId);

		const cred = await webauthnCredentialModel
			.query()
			.where("id", credentialId)
			.andWhere("user_id", userId)
			.andWhere("is_deleted", 0)
			.first();

		if (!cred) {
			throw new errs.ItemNotFoundError("Passkey not found");
		}

		await webauthnCredentialModel
			.query()
			.findById(credentialId)
			.patch({ friendly_name: friendlyName });

		return {
			id: cred.id,
			friendly_name: friendlyName,
			created_on: cred.created_on,
			device_type: cred.device_type,
			backed_up: cred.backed_up,
		};
	},

	/**
	 * Soft-delete a passkey
	 *
	 * @param   {Access}  access
	 * @param   {number}  userId
	 * @param   {number}  credentialId
	 * @returns {Promise<void>}
	 */
	remove: async (access, userId, credentialId) => {
		await access.can("users:password", userId);

		const cred = await webauthnCredentialModel
			.query()
			.where("id", credentialId)
			.andWhere("user_id", userId)
			.andWhere("is_deleted", 0)
			.first();

		if (!cred) {
			throw new errs.ItemNotFoundError("Passkey not found");
		}

		await webauthnCredentialModel
			.query()
			.findById(credentialId)
			.patch({ is_deleted: 1 });
	},
};

export default internalWebauthn;
