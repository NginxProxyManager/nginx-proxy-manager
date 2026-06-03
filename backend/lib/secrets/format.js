/**
 * Convert fetched secret payload to certbot INI format.
 * @param {*} payload - string or object from external store
 * @param {string} [field] - optional key when payload is JSON object
 */
export const toCertbotIni = (payload, field) => {
	if (typeof payload === "string") {
		return payload.trim();
	}

	if (payload && typeof payload === "object") {
		if (field && typeof payload[field] === "string") {
			return payload[field].trim();
		}
		if (field && payload[field] !== undefined) {
			return String(payload[field]);
		}
		// Flat object -> ini lines
		return Object.entries(payload)
			.filter(([, v]) => v !== null && v !== undefined && String(v).length)
			.map(([k, v]) => `${k} = ${v}`)
			.join("\n");
	}

	throw new Error("Unsupported secret payload format");
};
