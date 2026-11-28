import errs from "../error.js";

/**
 * The keys in a certbot credentials file that have a non-empty value. Comment lines are
 * ignored, and an empty value counts as unset, matching how certbot reads the file.
 *
 * @param   {string} credentialsIni
 * @returns {Set<string>}
 */
const setCredentialKeys = (credentialsIni) => {
	const keys = new Set();
	for (const line of `${credentialsIni || ""}`.split("\n")) {
		const match = line.match(/^\s*([A-Za-z0-9_.:-]+)\s*=\s*(.*?)\s*$/);
		if (match && match[2].replace(/^(["'])(.*)\1$/, "$2").length) {
			keys.add(match[1]);
		}
	}
	return keys;
};

/**
 * Rejects credentials that the provider's certbot plugin is known to refuse, so the problem
 * shows when the credentials are saved instead of when a certificate is issued or renewed.
 *
 * certbot-dns-cloudflare refuses an API token alongside the email + Global API key pair
 * ("dns_cloudflare_email and dns_cloudflare_api_key are not needed when using an API Token").
 *
 * @param {string} provider
 * @param {string} credentialsIni
 */
export const assertDnsCredentialsCompatible = (provider, credentialsIni) => {
	if (provider !== "cloudflare") {
		return;
	}
	const keys = setCredentialKeys(credentialsIni);
	if (
		keys.has("dns_cloudflare_api_token") &&
		(keys.has("dns_cloudflare_email") || keys.has("dns_cloudflare_api_key"))
	) {
		throw new errs.ValidationError(
			"Cloudflare credentials can use an API token (dns_cloudflare_api_token) or the email and Global API key (dns_cloudflare_email, dns_cloudflare_api_key), not both. Remove the lines you don't use; an API token is recommended.",
		);
	}
};
