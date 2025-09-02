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
function apiValidator(schema, payload /*, description*/) {
	return new Promise(function Promise_apiValidator(resolve, reject) {
		if (schema === null) {
			reject(new errs.ValidationError("Schema is undefined"));
			return;
		}

		if (typeof payload === "undefined") {
			reject(new errs.ValidationError("Payload is undefined"));
			return;
		}

		const validate = ajv.compile(schema);
		const valid = validate(payload);

		if (valid && !validate.errors) {
			resolve(payload);
		} else {
			const message = ajv.errorsText(validate.errors);
			const err = new errs.ValidationError(message);
			err.debug = [validate.errors, payload];
			reject(err);
		}
	});
}

export default apiValidator;
