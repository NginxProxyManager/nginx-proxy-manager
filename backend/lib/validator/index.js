import Ajv from 'ajv/dist/2020.js';
import _ from "lodash";
import commonDefinitions from "../../schema/common.json" with { type: "json" };
import errs from "../error.js";

RegExp.prototype.toJSON = RegExp.prototype.toString;

const ajv = new Ajv({
	verbose: true,
	allErrors: true,
	allowUnionTypes: true,
	coerceTypes: true,
	strict: false,
	schemas: [commonDefinitions],
});

const compiledSchemas = new WeakMap();

/**
 *
 * @param   {Object} schema
 * @param   {Object} payload
 * @returns {Promise}
 */
const validator = (schema, payload) => {
	return new Promise((resolve, reject) => {
		if (!payload) {
			reject(new errs.InternalValidationError("Payload is falsy"));
		} else {
			try {
				let validate = compiledSchemas.get(schema);
				if (!validate) {
					validate = ajv.compile(schema);
					compiledSchemas.set(schema, validate);
				}
				const valid = validate(payload);

				if (valid && !validate.errors) {
					resolve(_.cloneDeep(payload));
				} else {
					const message = ajv.errorsText(validate.errors);
					reject(new errs.InternalValidationError(message));
				}
			} catch (err) {
				reject(err);
			}
		}
	});
};

export default validator;
