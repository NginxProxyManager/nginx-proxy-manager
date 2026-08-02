import { createHash } from "node:crypto";

const isPlainObject = (value) => {
	if (value === null || typeof value !== "object") {
		return false;
	}
	const prototype = Object.getPrototypeOf(value);
	return prototype === Object.prototype || prototype === null;
};

/**
 * Produces stable JSON without silently accepting values that JSON.stringify
 * would drop or coerce. Arrays intentionally retain their order because order
 * is semantically meaningful for locations, headers and access rules.
 *
 * @param {unknown} value
 * @returns {string}
 */
export const canonicalize = (value) => {
	if (value === null) {
		return "null";
	}

	switch (typeof value) {
		case "boolean":
			return value ? "true" : "false";
		case "number":
			if (!Number.isFinite(value)) {
				throw new TypeError("Canonical JSON does not support non-finite numbers");
			}
			return JSON.stringify(value);
		case "string":
			return JSON.stringify(value);
		case "undefined":
			throw new TypeError("Canonical JSON does not support undefined");
		case "object":
			if (Array.isArray(value)) {
				return `[${value.map((item) => canonicalize(item)).join(",")}]`;
			}
			if (!isPlainObject(value)) {
				throw new TypeError("Canonical JSON only supports plain objects");
			}
			return `{${Object.keys(value)
				.sort()
				.map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`)
				.join(",")}}`;
		default:
			throw new TypeError(`Canonical JSON does not support ${typeof value}`);
	}
};

/** @param {string|Buffer} value */
export const sha256 = (value) => `sha256:${createHash("sha256").update(value).digest("hex")}`;

/** @param {unknown} value */
export const hashCanonical = (value) => sha256(canonicalize(value));

/**
 * Hashes fixed-path dependency/template inputs without embedding their content
 * into database records. Callers must pass a deterministic relative path.
 *
 * @param {Array<{path: string, content: string|Buffer}>} entries
 */
export const hashFileManifest = (entries) => {
	const normalized = entries
		.map(({ path, content }) => ({ path, content: Buffer.isBuffer(content) ? content.toString("base64") : String(content) }))
		.sort((left, right) => left.path.localeCompare(right.path));
	return hashCanonical(normalized);
};

export default { canonicalize, sha256, hashCanonical, hashFileManifest };
