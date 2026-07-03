import dnsPlugins from "../../certbot/dns-plugins.json" with { type: "json" };
import errs from "../error.js";
import credentialModel from "../../models/credential.js";
import now from "../../models/now_helper.js";
import { resolveExternalCredential } from "./resolvers/external.js";
import { readCredentialFile, writeCertbotCredentialsFile } from "./storage.js";

/**
 * Resolve DNS certbot credentials plaintext for a certificate.
 * @param {Object} certificate
 * @returns {Promise<string>}
 */
export const resolveDnsCredentials = async (certificate) => {
	const meta = certificate.meta || {};

	if (meta.credential_ref?.type === "external") {
		return resolveExternalCredential(meta.credential_ref);
	}

	if (meta.credential_ref?.type === "internal" && meta.credential_ref.id) {
		const credential = await credentialModel
			.query()
			.where("id", meta.credential_ref.id)
			.andWhere("is_deleted", 0)
			.first();

		if (!credential) {
			throw new errs.ValidationError("Referenced credential not found");
		}

		if (credential.dns_provider !== meta.dns_provider) {
			throw new errs.ValidationError("Credential DNS provider does not match certificate");
		}

		const plaintext = readCredentialFile(credential.id);
		await credentialModel.query().patchAndFetchById(credential.id, {
			last_used_at: now(),
		});
		return plaintext;
	}

	if (typeof meta.dns_provider_credentials === "string" && meta.dns_provider_credentials.length) {
		return meta.dns_provider_credentials;
	}

	throw new errs.ValidationError("DNS credentials are required (credential_ref or dns_provider_credentials)");
};

/**
 * @param {Object} certificate
 * @returns {Promise<string>}
 */
export const materializeCertbotCredentials = async (certificate) => {
	const plaintext = await resolveDnsCredentials(certificate);
	return writeCertbotCredentialsFile(certificate.id, plaintext);
};

/**
 * @param {string} provider
 * @param {string} credentialsIni
 */
export const validateDnsCredentialsFormat = (provider, credentialsIni) => {
	if (!dnsPlugins[provider]) {
		throw new errs.ValidationError(`Unknown DNS provider: ${provider}`);
	}
	if (!credentialsIni || typeof credentialsIni !== "string" || !credentialsIni.trim()) {
		throw new errs.ValidationError("Credentials cannot be empty");
	}
};
