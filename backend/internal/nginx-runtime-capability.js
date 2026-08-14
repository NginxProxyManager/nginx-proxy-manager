import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { validateCatalogCapability } from "./nginx-proxy-directive-catalog.js";
import { hashCanonical } from "./nginx-config-hash.js";

const baselinePath = fileURLToPath(new URL("../config/nginx-runtime-capability.json", import.meta.url));
const baseline = JSON.parse(fs.readFileSync(baselinePath, "utf8"));

export const normalizeNginxCapability = (input = {}) => {
	const capability = {
		...structuredClone(baseline),
		...structuredClone(input || {}),
		modules: [...new Set(input.modules ?? baseline.modules)].sort(),
	};
	delete capability.profile_hash;
	capability.profile_hash = hashCanonical(capability);
	return capability;
};

export const validateNginxCapability = (input = {}) => {
	const capability = normalizeNginxCapability(input);
	return { capability, diagnostics: validateCatalogCapability(capability) };
};

export const NGINX_RUNTIME_CAPABILITY = Object.freeze(normalizeNginxCapability());
export default { NGINX_RUNTIME_CAPABILITY, normalizeNginxCapability, validateNginxCapability };
