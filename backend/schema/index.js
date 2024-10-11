const refParser = require('@apidevtools/json-schema-ref-parser');

let compiledSchema = null;

module.exports = {

	/**
	 * Compiles the schema, by dereferencing it, only once
	 * and returns the memory cached value
	 */
	getCompiledSchema: async () => {
		if (compiledSchema === null) {
			compiledSchema = await refParser.dereference(__dirname + '/swagger.json', {
				mutateInputSchema: false,
			});
		}
		return compiledSchema;
	},

	/**
	 * Scans the schema for the validation schema for the given path and method
	 * and returns it.
	 *
	 * @param {string} path
	 * @param {string} method
	 * @returns string|null
	 */
	getValidationSchema: (path, method) => {
		if (compiledSchema !== null &&
			typeof compiledSchema.paths[path] !== 'undefined' &&
			typeof compiledSchema.paths[path][method] !== 'undefined' &&
			typeof compiledSchema.paths[path][method].requestBody !== 'undefined' &&
			typeof compiledSchema.paths[path][method].requestBody.content !== 'undefined' &&
			typeof compiledSchema.paths[path][method].requestBody.content['application/json'] !== 'undefined' &&
			typeof compiledSchema.paths[path][method].requestBody.content['application/json'].schema !== 'undefined'
		) {
			return compiledSchema.paths[path][method].requestBody.content['application/json'].schema;
		}
		return null;
	}
};
