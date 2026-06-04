import errs from "../error.js";
import { normalizeInfisicalMeta } from "./meta.js";

const PROVIDER_TYPES = ["vault", "aws", "azure", "infisical", "http"];

const requireString = (value, label) => {
	if (typeof value !== "string" || !value.trim()) {
		throw new errs.ValidationError(`${label} is required`);
	}
	return value.trim();
};

/**
 * @param {Object} data
 * @param {{ isCreate?: boolean }} options
 */
export const validateCredentialProviderPayload = (data, { isCreate = false } = {}) => {
	if (!PROVIDER_TYPES.includes(data.type)) {
		throw new errs.ValidationError(`Invalid provider type. Must be one of: ${PROVIDER_TYPES.join(", ")}`);
	}

	requireString(data.name, "name");
	const meta = data.meta && typeof data.meta === "object" ? data.meta : {};

	switch (data.type) {
		case "infisical": {
			const inf = normalizeInfisicalMeta(meta);
			if (!inf.workspace_id) {
				throw new errs.ValidationError("Infisical provider requires workspace_id in meta");
			}
			if (inf.auth_method === "oidc") {
				if (!inf.identity_id) {
					throw new errs.ValidationError("Infisical OIDC Auth requires identity_id in meta");
				}
				if (!inf.jwt_file_path && !inf.jwt_env_var) {
					throw new errs.ValidationError(
						"Infisical OIDC Auth requires jwt_file_path or jwt_env_var in meta",
					);
				}
				if (inf.jwt_file_path && inf.jwt_env_var) {
					throw new errs.ValidationError("Set only one of jwt_file_path or jwt_env_var");
				}
			} else if (isCreate) {
				requireString(data.oidc_client_id, "client ID");
				requireString(data.oidc_client_secret, "client secret");
			}
			break;
		}
		case "vault": {
			requireString(meta.address, "Vault address in meta");
			if (isCreate) {
				requireString(data.oidc_issuer, "issuer");
				requireString(data.oidc_client_id, "client ID");
				requireString(data.oidc_client_secret, "client secret");
			}
			break;
		}
		case "aws": {
			requireString(meta.region, "AWS region in meta");
			requireString(meta.role_arn || meta.roleArn, "AWS role_arn in meta");
			if (isCreate) {
				requireString(data.oidc_issuer, "issuer");
				requireString(data.oidc_client_id, "client ID");
				requireString(data.oidc_client_secret, "client secret");
			}
			break;
		}
		case "azure": {
			requireString(meta.tenant_id || meta.tenantId, "Azure tenant_id in meta");
			requireString(meta.vault_url || meta.vaultUrl, "Azure vault_url in meta");
			if (isCreate) {
				requireString(data.oidc_client_id, "client ID");
				requireString(data.oidc_client_secret, "client secret");
			}
			break;
		}
		case "http": {
			requireString(meta.url_template || meta.urlTemplate, "HTTP url_template in meta");
			if (isCreate) {
				requireString(data.oidc_issuer, "issuer");
				requireString(data.oidc_client_id, "client ID");
				requireString(data.oidc_client_secret, "client secret");
			}
			break;
		}
		default:
			break;
	}
};
