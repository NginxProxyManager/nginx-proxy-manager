/**
 * Unit tests for backend/lib/validator/api.js
 *
 * Tests the custom formatValidationErrors() formatter and the apiValidator()
 * function that replaces ajv.errorsText() with human-readable messages.
 *
 * Run with Jest + ESM support:
 *   NODE_OPTIONS="--experimental-vm-modules" npx jest --testPathPattern=api-validator
 */

import { formatValidationErrors } from "../../lib/validator/api.js";
import apiValidator from "../../lib/validator/api.js";

// ---------------------------------------------------------------------------
// Shared test schema (mirrors LDAP settings schema)
// ---------------------------------------------------------------------------
const ldapSchema = {
	type: "object",
	additionalProperties: false,
	minProperties: 1,
	properties: {
		serverUrl: { type: "string", minLength: 1, pattern: "^ldaps?://" },
		bindDN: { type: "string" },
		bindPassword: { type: "string" },
		tlsVerify: { type: "boolean" },
		starttls: { type: "boolean" },
		enabled: { type: "boolean" },
		userAttribute: { type: "string", enum: ["uid", "sAMAccountName", "mail", "userPrincipalName"] },
		searchBase: { type: "string", minLength: 1 },
	},
	required: ["serverUrl"],
};

// ---------------------------------------------------------------------------
// formatValidationErrors — unit tests
// ---------------------------------------------------------------------------

describe("formatValidationErrors", () => {
	describe("empty / null input", () => {
		it("returns fallback message for null errors", () => {
			expect(formatValidationErrors(null)).toBe("Validation failed");
		});

		it("returns fallback message for empty array", () => {
			expect(formatValidationErrors([])).toBe("Validation failed");
		});
	});

	describe("additionalProperties errors", () => {
		it("names the unknown field when one extra field is sent", () => {
			const errors = [
				{
					keyword: "additionalProperties",
					instancePath: "",
					params: { additionalProperty: "bindDn" },
					message: "must NOT have additional properties",
				},
			];
			const msg = formatValidationErrors(errors);
			expect(msg).toContain("Unknown field: bindDn");
		});

		it("lists multiple unknown fields", () => {
			const errors = [
				{ keyword: "additionalProperties", instancePath: "", params: { additionalProperty: "bindDn" }, message: "" },
				{ keyword: "additionalProperties", instancePath: "", params: { additionalProperty: "groupDn" }, message: "" },
			];
			const msg = formatValidationErrors(errors);
			expect(msg).toMatch(/Unknown fields: bindDn, groupDn/);
		});

		it("includes expected fields when schema.properties is provided", () => {
			const errors = [
				{ keyword: "additionalProperties", instancePath: "", params: { additionalProperty: "bindDn" }, message: "" },
			];
			const schema = { properties: { bindDN: {}, serverUrl: {}, tlsVerify: {} } };
			const msg = formatValidationErrors(errors, schema);
			expect(msg).toContain("Expected fields: bindDN, serverUrl, tlsVerify");
		});

		it("omits 'Expected fields' when schema has no properties", () => {
			const errors = [
				{ keyword: "additionalProperties", instancePath: "", params: { additionalProperty: "foo" }, message: "" },
			];
			const msg = formatValidationErrors(errors, {});
			expect(msg).not.toContain("Expected fields");
		});
	});

	describe("required field errors", () => {
		it("names a single missing required field", () => {
			const errors = [
				{ keyword: "required", instancePath: "", params: { missingProperty: "serverUrl" }, message: "" },
			];
			const msg = formatValidationErrors(errors);
			expect(msg).toBe("Missing required field: serverUrl");
		});

		it("names multiple missing required fields with plural label", () => {
			const errors = [
				{ keyword: "required", instancePath: "", params: { missingProperty: "serverUrl" }, message: "" },
				{ keyword: "required", instancePath: "", params: { missingProperty: "searchBase" }, message: "" },
			];
			const msg = formatValidationErrors(errors);
			expect(msg).toMatch(/^Missing required fields: serverUrl, searchBase$/);
		});
	});

	describe("type errors", () => {
		it("shows expected vs actual type for boolean field with string value", () => {
			const errors = [
				{
					keyword: "type",
					instancePath: "/tlsVerify",
					params: { type: "boolean" },
					data: "true",
					message: "must be boolean",
				},
			];
			const msg = formatValidationErrors(errors);
			expect(msg).toBe("Invalid type for tlsVerify: expected boolean, got string");
		});

		it("uses dot notation for nested paths", () => {
			const errors = [
				{
					keyword: "type",
					instancePath: "/meta/redirect",
					params: { type: "string" },
					data: 42,
					message: "must be string",
				},
			];
			const msg = formatValidationErrors(errors);
			expect(msg).toBe("Invalid type for meta.redirect: expected string, got number");
		});

		it("handles null data correctly (not 'object')", () => {
			const errors = [
				{
					keyword: "type",
					instancePath: "/enabled",
					params: { type: "boolean" },
					data: null,
					message: "must be boolean",
				},
			];
			const msg = formatValidationErrors(errors);
			expect(msg).toBe("Invalid type for enabled: expected boolean, got null");
		});

		it("handles array data type", () => {
			const errors = [
				{
					keyword: "type",
					instancePath: "/serverUrl",
					params: { type: "string" },
					data: ["ldap://x"],
					message: "must be string",
				},
			];
			const msg = formatValidationErrors(errors);
			expect(msg).toBe("Invalid type for serverUrl: expected string, got array");
		});

		it("joins union types with 'or'", () => {
			const errors = [
				{
					keyword: "type",
					instancePath: "/value",
					params: { type: ["string", "number"] },
					data: true,
					message: "must be string,number",
				},
			];
			const msg = formatValidationErrors(errors);
			expect(msg).toBe("Invalid type for value: expected string or number, got boolean");
		});
	});

	describe("enum errors", () => {
		it("shows allowed values for enum violation", () => {
			const errors = [
				{
					keyword: "enum",
					instancePath: "/userAttribute",
					params: { allowedValues: ["uid", "sAMAccountName", "mail", "userPrincipalName"] },
					data: "username",
					message: "must be equal to one of the allowed values",
				},
			];
			const msg = formatValidationErrors(errors);
			expect(msg).toContain("Invalid value for userAttribute: must be one of [uid, sAMAccountName, mail, userPrincipalName]");
		});
	});

	describe("minLength errors", () => {
		it("reports empty-string violation with field name", () => {
			const errors = [
				{
					keyword: "minLength",
					instancePath: "/searchBase",
					params: { limit: 1 },
					data: "",
					message: "must NOT have fewer than 1 characters",
				},
			];
			const msg = formatValidationErrors(errors);
			expect(msg).toBe("searchBase must not be empty");
		});
	});

	describe("pattern errors", () => {
		it("shows AJV-compatible path for pattern mismatch", () => {
			const errors = [
				{
					keyword: "pattern",
					instancePath: "/serverUrl",
					params: { pattern: "^ldaps?://" },
					data: "http://dc.example.com",
					message: "must match pattern",
				},
			];
			const msg = formatValidationErrors(errors);
			expect(msg).toContain('data/serverUrl must match pattern');
		});

		it("handles nested paths correctly", () => {
			const errors = [
				{
					keyword: "pattern",
					instancePath: "/domain_names/0",
					params: { pattern: "^[a-z]" },
					data: "x".repeat(100),
					message: "must match pattern",
				},
			];
			const msg = formatValidationErrors(errors);
			expect(msg).toBe("data/domain_names/0 must match pattern");
		});
	});

	describe("minProperties errors", () => {
		it("describes empty body clearly", () => {
			const errors = [
				{
					keyword: "minProperties",
					instancePath: "",
					params: { limit: 1 },
					data: {},
					message: "must NOT have fewer than 1 properties",
				},
			];
			const msg = formatValidationErrors(errors);
			expect(msg).toBe("Request body must contain at least one property");
		});
	});

	describe("multiple errors combined", () => {
		it("combines unknown fields + type errors with semicolons", () => {
			const errors = [
				{ keyword: "additionalProperties", instancePath: "", params: { additionalProperty: "bindDn" }, message: "" },
				{ keyword: "type", instancePath: "/tlsVerify", params: { type: "boolean" }, data: "yes", message: "" },
			];
			const schema = { properties: { bindDN: {}, tlsVerify: {} } };
			const msg = formatValidationErrors(errors, schema);
			expect(msg).toContain("Unknown field: bindDn");
			expect(msg).toContain("Invalid type for tlsVerify: expected boolean, got string");
			// Parts joined by "; "
			expect(msg.split("; ").length).toBe(2);
		});
	});

	describe("unknown keyword fallback", () => {
		it("falls back to AJV message with field path appended", () => {
			const errors = [
				{
					keyword: "uniqueItems",
					instancePath: "/tags",
					params: {},
					message: "must NOT have duplicate items",
				},
			];
			const msg = formatValidationErrors(errors);
			expect(msg).toBe("must NOT have duplicate items (tags)");
		});

		it("falls back to AJV message without path when instancePath is empty", () => {
			const errors = [
				{
					keyword: "someUnknown",
					instancePath: "",
					params: {},
					message: "some unknown error",
				},
			];
			const msg = formatValidationErrors(errors);
			expect(msg).toBe("some unknown error");
		});
	});
});

// ---------------------------------------------------------------------------
// apiValidator — integration tests with real AJV
// ---------------------------------------------------------------------------

describe("apiValidator (integration)", () => {
	describe("valid payloads", () => {
		it("returns payload unchanged when valid", async () => {
			const payload = { serverUrl: "ldap://dc.example.com", tlsVerify: true };
			const result = await apiValidator(ldapSchema, payload);
			expect(result).toEqual(payload);
		});
	});

	describe("unknown fields", () => {
		it("reports unknown field names, not raw AJV text", async () => {
			const payload = { serverUrl: "ldap://dc.example.com", bindDn: "cn=svc" };
			await expect(apiValidator(ldapSchema, payload)).rejects.toMatchObject({
				message: expect.stringContaining("Unknown field: bindDn"),
			});
		});

		it("includes Expected fields list from schema", async () => {
			const payload = { serverUrl: "ldap://dc.example.com", typo: "x" };
			await expect(apiValidator(ldapSchema, payload)).rejects.toMatchObject({
				message: expect.stringContaining("Expected fields:"),
			});
		});

		it("does NOT contain raw AJV text 'must NOT have additional properties'", async () => {
			const payload = { serverUrl: "ldap://dc.example.com", badField: true };
			await expect(apiValidator(ldapSchema, payload)).rejects.toMatchObject({
				message: expect.not.stringContaining("must NOT have additional properties"),
			});
		});
	});

	describe("type errors", () => {
		it("names the field with wrong type", async () => {
			// AJV coerceTypes is on, so "true" (string) gets coerced to boolean
			// Use a value that can't be coerced: object for boolean
			const schema = {
				type: "object",
				additionalProperties: false,
				properties: { tlsVerify: { type: "boolean" } },
			};
			const payload = { tlsVerify: { not: "a boolean" } };
			await expect(apiValidator(schema, payload)).rejects.toMatchObject({
				message: expect.stringContaining("tlsVerify"),
			});
		});
	});

	describe("enum errors", () => {
		it("shows allowed values for invalid enum", async () => {
			const payload = { serverUrl: "ldap://dc.example.com", userAttribute: "cn" };
			await expect(apiValidator(ldapSchema, payload)).rejects.toMatchObject({
				message: expect.stringContaining("must be one of [uid, sAMAccountName, mail, userPrincipalName]"),
			});
		});
	});

	describe("missing required fields", () => {
		it("names the missing field, not generic AJV text", async () => {
			const schema = {
				type: "object",
				additionalProperties: false,
				required: ["serverUrl"],
				properties: { serverUrl: { type: "string" } },
			};
			const payload = {};
			await expect(apiValidator(schema, payload)).rejects.toMatchObject({
				message: expect.stringContaining("Missing required field: serverUrl"),
			});
		});
	});

	describe("guard clauses", () => {
		it("throws with 'Schema is undefined' when schema is falsy", async () => {
			await expect(apiValidator(null, {})).rejects.toMatchObject({
				message: "Schema is undefined",
			});
		});

		it("throws with 'Payload is undefined' when payload is undefined", async () => {
			await expect(apiValidator(ldapSchema, undefined)).rejects.toMatchObject({
				message: "Payload is undefined",
			});
		});
	});
});
