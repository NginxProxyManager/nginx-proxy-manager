import Ajv from "ajv/dist/2020.js";
import errs from "../error.js";

const ajv = new Ajv({
	verbose: true,
	allErrors: true,
	allowUnionTypes: true,
	strict: false,
	coerceTypes: true,
});

/**
 * Format AJV validation errors into human-readable messages.
 * Groups errors by keyword for cleaner output instead of raw AJV text.
 *
 * Examples:
 *   - "Unknown fields: bindDn, groupDn. Expected fields: bindDN, groupDN, serverUrl, ..."
 *   - "Missing required field: serverUrl"
 *   - "Invalid type for tlsVerify: expected boolean, got string"
 *   - "Invalid value for userAttribute: must be one of [uid, sAMAccountName, mail, userPrincipalName]"
 *
 * @param {import("ajv").ErrorObject[]} errors - AJV validate.errors array
 * @param {Object|null} schema - The JSON schema used for validation (for listing expected fields)
 * @returns {string} Human-readable error message
 */
const formatValidationErrors = (errors, schema = null) => {
	if (!errors || errors.length === 0) {
		return "Validation failed";
	}

	const messages = [];
	const additionalProps = [];
	const requiredFields = [];
	const typeErrors = [];
	const otherErrors = [];

	for (const err of errors) {
		// instancePath is like "/tlsVerify" or "/meta/redirect" — convert to dot notation
		const fieldPath = err.instancePath
			? err.instancePath.replace(/^\//, "").replace(/\//g, ".")
			: null;

		switch (err.keyword) {
			case "additionalProperties":
				additionalProps.push(err.params.additionalProperty);
				break;

			case "required":
				requiredFields.push(err.params.missingProperty);
				break;

			case "type": {
				const field = fieldPath || "value";
				// typeof null === "object", Array.isArray check keeps it useful
				const actual = err.data === null ? "null" : Array.isArray(err.data) ? "array" : typeof err.data;
				const expected = Array.isArray(err.params.type) ? err.params.type.join(" or ") : err.params.type;
				typeErrors.push(`Invalid type for ${field}: expected ${expected}, got ${actual}`);
				break;
			}

			case "enum": {
				const field = fieldPath || "value";
				const allowed = err.params.allowedValues.join(", ");
				otherErrors.push(`Invalid value for ${field}: must be one of [${allowed}]`);
				break;
			}

			case "minLength": {
				const field = fieldPath || "value";
				otherErrors.push(`${field} must not be empty`);
				break;
			}

			case "maxLength": {
				const field = fieldPath || "value";
				otherErrors.push(`${field} is too long (max ${err.params.limit} characters)`);
				break;
			}

			case "minimum":
			case "exclusiveMinimum": {
				const field = fieldPath || "value";
				otherErrors.push(`${field} must be at least ${err.params.limit}`);
				break;
			}

			case "maximum":
			case "exclusiveMaximum": {
				const field = fieldPath || "value";
				otherErrors.push(`${field} must be at most ${err.params.limit}`);
				break;
			}

			case "pattern": {
				const rawPath = err.instancePath
					? `data${err.instancePath.replace(/\//g, '/')}`
					: (fieldPath || "value");
				otherErrors.push(`${rawPath} must match pattern`);
				break;
			}

			case "format": {
				const field = fieldPath || "value";
				otherErrors.push(`Invalid ${err.params.format} format for ${field}`);
				break;
			}

			case "minProperties":
				otherErrors.push("Request body must contain at least one property");
				break;

			case "maxProperties":
				otherErrors.push(`Request body must not have more than ${err.params.limit} properties`);
				break;

			default: {
				// Fallback: use AJV's message but append field path if available
				const suffix = fieldPath ? ` (${fieldPath})` : "";
				otherErrors.push(`${err.message}${suffix}`);
				break;
			}
		}
	}

	// Collect: unknown fields → suggest expected ones
	if (additionalProps.length > 0) {
		const plural = additionalProps.length > 1 ? "s" : "";
		let msg = `Unknown field${plural}: ${additionalProps.join(", ")}`;
		if (schema?.properties) {
			const expected = Object.keys(schema.properties).join(", ");
			msg += `. Expected fields: ${expected}`;
		}
		messages.push(msg);
	}

	// Collect: missing required fields
	if (requiredFields.length > 0) {
		const label = requiredFields.length === 1 ? "Missing required field" : "Missing required fields";
		messages.push(`${label}: ${requiredFields.join(", ")}`);
	}

	// Append remaining errors in order
	messages.push(...typeErrors);
	messages.push(...otherErrors);

	return messages.join("; ");
};

/**
 * @param {Object} schema
 * @param {Object} payload
 * @returns {Promise}
 */
const apiValidator = async (schema, payload /*, description*/) => {
	if (!schema) {
		throw new errs.ValidationError("Schema is undefined");
	}

	// Can't use falsy check here as valid payload could be `0` or `false`
	if (typeof payload === "undefined") {
		throw new errs.ValidationError("Payload is undefined");
	}

	const validate = ajv.compile(schema);
	const valid = validate(payload);

	if (valid && !validate.errors) {
		return payload;
	}

	const message = formatValidationErrors(validate.errors, schema);
	const err = new errs.ValidationError(message);
	err.debug = {validationErrors: validate.errors, payload};
	throw err;
};

export { formatValidationErrors };
export default apiValidator;
