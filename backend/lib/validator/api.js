const error = require('../error');

const ajv = require('ajv')({
	verbose:        true,
	validateSchema: true,
	allErrors:      false,
	format:         'full',
	coerceTypes:    true
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

		let validate = ajv.compile(schema);
		let valid    = validate(payload);

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
