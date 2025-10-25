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



	const message = ajv.errorsText(validate.errors);
	const err = new errs.ValidationError(message);
	err.debug = {validationErrors: validate.errors, payload};
	throw err;
};

export default apiValidator;
