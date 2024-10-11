const Ajv   = require('ajv/dist/2020');
const error = require('../error');

const ajv = new Ajv({
	verbose:         true,
	allErrors:       true,
	allowUnionTypes: true,
	strict:          false,
	coerceTypes:     true,
});

/**
 * @param {Object} schema
 * @param {Object} payload
 * @returns {Promise}
 */
function apiValidator (schema, payload/*, description*/) {
	return new Promise(function Promise_apiValidator (resolve, reject) {
		if (schema === null) {
			reject(new error.ValidationError('Schema is undefined'));
			return;
		}

		if (typeof payload === 'undefined') {
			reject(new error.ValidationError('Payload is undefined'));
			return;
		}

		const validate = ajv.compile(schema);
		const valid    = validate(payload);

		if (valid && !validate.errors) {
			resolve(payload);
		} else {
			let message = ajv.errorsText(validate.errors);
			let err     = new error.ValidationError(message);
			err.debug   = [validate.errors, payload];
			reject(err);
		}
	});
}

module.exports = apiValidator;
