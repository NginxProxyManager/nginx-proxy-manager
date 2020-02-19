const error  = require('../error');
const path   = require('path');
const parser = require('json-schema-ref-parser');

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
		if (typeof payload === 'undefined') {
			reject(new error.ValidationError('Payload is undefined'));
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

apiValidator.loadSchemas = parser
	.dereference(path.resolve('schema/index.json'))
	.then((schema) => {
		ajv.addSchema(schema);
		return schema;
	});

module.exports = apiValidator;
