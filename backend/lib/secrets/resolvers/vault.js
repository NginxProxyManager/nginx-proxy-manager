import errs from "../../error.js";
import { toCertbotIni } from "../format.js";

/**
 * HashiCorp Vault KV v2 via JWT/OIDC login.
 * meta: { address, mount, role, jwt_auth_path }
 */
export const resolveVault = async (provider, secretRef, accessToken) => {
	const { address, mount = "secret", role, jwt_auth_path = "jwt" } = provider.meta || {};
	if (!address) {
		throw new errs.ValidationError("Vault address is required in provider meta");
	}

	const base = address.replace(/\/$/, "");
	let vaultToken = accessToken;

	if (role) {
		const loginRes = await fetch(`${base}/v1/auth/${jwt_auth_path}/login`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ role, jwt: accessToken }),
			signal: AbortSignal.timeout(15000),
		});
		if (!loginRes.ok) {
			throw new errs.ValidationError(`Vault JWT login failed (${loginRes.status})`);
		}
		const loginData = await loginRes.json();
		vaultToken = loginData.auth?.client_token;
		if (!vaultToken) {
			throw new errs.ValidationError("Vault login did not return client_token");
		}
	}

	const path = secretRef.path?.replace(/^\//, "");
	const secretRes = await fetch(`${base}/v1/${mount}/data/${path}`, {
		headers: { "X-Vault-Token": vaultToken },
		signal: AbortSignal.timeout(15000),
	});

	if (!secretRes.ok) {
		throw new errs.ValidationError(`Vault read failed (${secretRes.status})`);
	}

	const secretData = await secretRes.json();
	const payload = secretData.data?.data ?? secretData.data;
	return toCertbotIni(payload, secretRef.field);
};
