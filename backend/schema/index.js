import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import $RefParser from "@apidevtools/json-schema-ref-parser";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let compiledSchema = null;

/**
 * Compiles the schema, by dereferencing it, only once
 * and returns the memory cached value
 */
const getCompiledSchema = async () => {
	if (compiledSchema === null) {
		compiledSchema = await $RefParser.dereference(`${__dirname}/swagger.json`, {
			mutateInputSchema: false,
		});
	}
	return compiledSchema;
};

/**
 * Scans the schema for the validation schema for the given path and method
 * and returns it.
 *
 * @param {string} path
 * @param {string} method
 * @returns string|null
 */
const getValidationSchema = (path, method) => {
	if (
		compiledSchema !== null &&
		typeof compiledSchema.paths[path] !== "undefined" &&
		typeof compiledSchema.paths[path][method] !== "undefined" &&
		typeof compiledSchema.paths[path][method].requestBody !== "undefined" &&
		typeof compiledSchema.paths[path][method].requestBody.content !== "undefined" &&
		typeof compiledSchema.paths[path][method].requestBody.content["application/json"] !== "undefined" &&
		typeof compiledSchema.paths[path][method].requestBody.content["application/json"].schema !== "undefined"
	) {
		return compiledSchema.paths[path][method].requestBody.content["application/json"].schema;
	}
	return null;
};

export { getCompiledSchema, getValidationSchema };
