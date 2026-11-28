const SENSITIVE_META_KEYS = [
	"dns_provider_credentials",
	"certificate_key",
	"certificate",
	"intermediate_certificate",
	"oidc_client_secret",
];

const SENSITIVE_REF_KEYS = ["credentials"];

/**
 * Deep-clone and redact secrets from audit log / API meta payloads.
 * @param {*} meta
 * @returns {*}
 */
export const scrubAuditMeta = (meta) => {
	if (!meta || typeof meta !== "object") {
		return meta;
	}

	if (Array.isArray(meta)) {
		return meta.map(scrubAuditMeta);
	}

	const out = {};
	for (const [key, value] of Object.entries(meta)) {
		if (SENSITIVE_META_KEYS.includes(key)) {
			out[key] = "[redacted]";
			continue;
		}
		if (key === "meta" && value && typeof value === "object") {
			out.meta = scrubAuditMeta(value);
			continue;
		}
		if (key === "credential_ref" && value && typeof value === "object") {
			out.credential_ref = { ...value };
			continue;
		}
		if (typeof value === "object" && value !== null) {
			out[key] = scrubAuditMeta(value);
		} else {
			out[key] = value;
		}
	}
	return out;
};
