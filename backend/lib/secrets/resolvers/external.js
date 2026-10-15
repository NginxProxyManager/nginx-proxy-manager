import { loadProvider, resolveFromProvider } from "./index.js";

/**
 * Resolve credentials from an external store (Vault, AWS, Azure, Infisical, HTTP).
 * @param {Object} credentialRef
 * @returns {Promise<string>}
 */
export const resolveExternalCredential = async (credentialRef) => {
	if (credentialRef?.type !== "external") {
		throw new errs.ValidationError("Invalid external credential reference");
	}

	if (!credentialRef.provider_id) {
		throw new errs.ValidationError("external credential_ref requires provider_id");
	}

	const provider = await loadProvider(credentialRef.provider_id);
	return resolveFromProvider(provider, credentialRef);
};
