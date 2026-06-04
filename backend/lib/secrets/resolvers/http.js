import errs from "../../error.js";
import { toCertbotIni } from "../format.js";

/**
 * Generic HTTP secret endpoint.
 * meta: { url_template } — use {path} placeholder, e.g. https://vault.example/secrets/{path}
 */
export const resolveHttp = async (provider, secretRef, accessToken) => {
	const { url_template, method = "GET", headers: extraHeaders = {} } = provider.meta || {};
	if (!url_template) {
		throw new errs.ValidationError("HTTP provider requires url_template in meta");
	}

	const path = secretRef.path || "";
	const url = url_template.replace("{path}", encodeURIComponent(path.replace(/^\//, "")));

	const headers = {
		Authorization: `Bearer ${accessToken}`,
		Accept: "application/json",
		...extraHeaders,
	};

	const response = await fetch(url, {
		method,
		headers,
		signal: AbortSignal.timeout(15000),
	});

	if (!response.ok) {
		throw new errs.ValidationError(`HTTP secret fetch failed (${response.status})`);
	}

	const contentType = response.headers.get("content-type") || "";
	if (contentType.includes("application/json")) {
		const data = await response.json();
		return toCertbotIni(data, secretRef.field);
	}

	return toCertbotIni(await response.text(), secretRef.field);
};
