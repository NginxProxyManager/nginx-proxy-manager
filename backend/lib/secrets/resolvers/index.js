import credentialProviderModel from "../../../models/credential_provider.js";
import errs from "../../error.js";
import { fetchClientCredentialsToken } from "../oidc.js";
import { readProviderSecret } from "../provider-storage.js";
import { resolveAws } from "./aws.js";
import { resolveAzure } from "./azure.js";
import { resolveHttp } from "./http.js";
import { resolveInfisical } from "./infisical.js";
import { resolveVault } from "./vault.js";

const resolvers = {
	vault: resolveVault,
	aws: resolveAws,
	azure: resolveAzure,
	infisical: resolveInfisical,
	http: resolveHttp,
};

export const loadProvider = async (providerId) => {
	const provider = await credentialProviderModel
		.query()
		.where("id", providerId)
		.andWhere("is_deleted", 0)
		.first();

	if (!provider) {
		throw new errs.ValidationError(`Credential provider ${providerId} not found`);
	}

	return provider;
};

export const getProviderAccessToken = async (provider) => {
	const clientSecret = readProviderSecret(provider.id);
	if (!provider.oidc_client_id || !clientSecret) {
		throw new errs.ValidationError("Provider OIDC client_id and client_secret are required");
	}

	return fetchClientCredentialsToken({
		issuer: provider.oidc_issuer,
		tokenUrl: provider.meta?.token_url,
		clientId: provider.oidc_client_id,
		clientSecret,
		audience: provider.oidc_audience,
		scope: provider.oidc_scope,
	});
};

/**
 * @param {Object} provider
 * @param {Object} secretRef
 */
export const resolveFromProvider = async (provider, secretRef) => {
	const resolver = resolvers[provider.type];
	if (!resolver) {
		throw new errs.ValidationError(`Unknown credential provider type: ${provider.type}`);
	}

	const accessToken = await getProviderAccessToken(provider);
	return resolver(provider, secretRef, accessToken);
};
