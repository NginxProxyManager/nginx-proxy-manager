import errs from "../../error.js";
import { fetchAzureAdToken } from "../oidc.js";
import { toCertbotIni } from "../format.js";

/**
 * Azure Key Vault secret.
 * meta: { tenant_id, vault_url } — vault_url e.g. https://myvault.vault.azure.net
 */
export const resolveAzure = async (provider, secretRef, clientSecret) => {
	const { tenant_id, vault_url } = provider.meta || {};
	if (!tenant_id || !vault_url) {
		throw new errs.ValidationError("Azure provider requires tenant_id and vault_url in meta");
	}

	const token = await fetchAzureAdToken({
		tenantId: tenant_id,
		clientId: provider.oidc_client_id,
		clientSecret,
	});

	const secretName = secretRef.path?.replace(/^\//, "");
	const url = `${vault_url.replace(/\/$/, "")}/secrets/${secretName}?api-version=7.4`;

	const response = await fetch(url, {
		headers: { Authorization: `Bearer ${token}` },
		signal: AbortSignal.timeout(15000),
	});

	if (!response.ok) {
		throw new errs.ValidationError(`Azure Key Vault read failed (${response.status})`);
	}

	const data = await response.json();
	return toCertbotIni(data.value, secretRef.field);
};
