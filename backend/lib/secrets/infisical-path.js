import errs from "../error.js";

/**
 * Split NPM credential_ref into Infisical API secretName + secretPath (folder).
 *
 * Supported path forms:
 * - cloudflare-api-token → secret at /
 * - /DNS/cloudflare-api-token → secret key under /DNS
 * - DNS/cloudflare-api-token → same as above
 *
 * If field is set, path is the folder (default /) and field is the secret key.
 *
 * @param {{ path?: string, field?: string }} secretRef
 */
export const parseInfisicalSecretRef = (secretRef) => {
	const field = typeof secretRef?.field === "string" ? secretRef.field.trim() : "";

	if (field) {
		const rawFolder = (secretRef?.path || "").trim();
		const secretPath = normalizeInfisicalFolder(rawFolder || "/");
		return { secretName: field, secretPath };
	}

	const raw = (secretRef?.path || "").trim();
	if (!raw || raw === "/") {
		throw new errs.ValidationError(
			"Infisical path must include a secret name (e.g. /DNS/cloudflare-api-token or cloudflare-api-token for root)",
		);
	}

	const normalized = raw.startsWith("/") ? raw : `/${raw}`;
	const segments = normalized.split("/").filter(Boolean);
	if (segments.length === 0) {
		throw new errs.ValidationError("Infisical path must include a secret name");
	}

	const secretName = segments[segments.length - 1];
	const folderSegments = segments.slice(0, -1);
	const secretPath = folderSegments.length ? `/${folderSegments.join("/")}` : "/";

	return { secretName, secretPath };
};

/**
 * @param {string} folder
 */
const normalizeInfisicalFolder = (folder) => {
	const trimmed = folder.trim();
	if (!trimmed || trimmed === "/") {
		return "/";
	}
	return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
};
