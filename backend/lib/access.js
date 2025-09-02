/**
 * Some Notes: This is a friggin complicated piece of code.
 *
 * "scope" in this file means "where did this token come from and what is using it", so 99% of the time
 * the "scope" is going to be "user" because it would be a user token. This is not to be confused with
 * the "role" which could be "user" or "admin". The scope in fact, could be "worker" or anything else.
 */

import fs from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv from "ajv/dist/2020.js";
import _ from "lodash";
import { access as logger } from "../logger.js";
import proxyHostModel from "../models/proxy_host.js";
import TokenModel from "../models/token.js";
import userModel from "../models/user.js";
import permsSchema from "./access/permissions.json" with { type: "json" };
import roleSchema from "./access/roles.json" with { type: "json" };
import errs from "./error.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default function (token_string) {
	const Token = TokenModel();
	let token_data = null;
	let initialised = false;
	const object_cache = {};
	let allow_internal_access = false;
	let user_roles = [];
	let permissions = {};

	/**
	 * Loads the Token object from the token string
	 *
	 * @returns {Promise}
	 */
	this.init = () => {
		return new Promise((resolve, reject) => {
			if (initialised) {
				resolve();
			} else if (!token_string) {
				reject(new errs.PermissionError("Permission Denied"));
			} else {
				resolve(
					Token.load(token_string).then((data) => {
						token_data = data;

						// At this point we need to load the user from the DB and make sure they:
						// - exist (and not soft deleted)
						// - still have the appropriate scopes for this token
						// This is only required when the User ID is supplied or if the token scope has `user`

						if (
							token_data.attrs.id ||
							(typeof token_data.scope !== "undefined" &&
								_.indexOf(token_data.scope, "user") !== -1)
						) {
							// Has token user id or token user scope
							return userModel
								.query()
								.where("id", token_data.attrs.id)
								.andWhere("is_deleted", 0)
								.andWhere("is_disabled", 0)
								.allowGraph("[permissions]")
								.withGraphFetched("[permissions]")
								.first()
								.then((user) => {
									if (user) {
										// make sure user has all scopes of the token
										// The `user` role is not added against the user row, so we have to just add it here to get past this check.
										user.roles.push("user");

										let is_ok = true;
										_.forEach(token_data.scope, (scope_item) => {
											if (_.indexOf(user.roles, scope_item) === -1) {
												is_ok = false;
											}
										});

										if (!is_ok) {
											throw new errs.AuthError("Invalid token scope for User");
										}
										initialised = true;
										user_roles = user.roles;
										permissions = user.permissions;
									} else {
										throw new errs.AuthError("User cannot be loaded for Token");
									}
								});
						}
						initialised = true;
					}),
				);
			}
		});
	};

	/**
	 * Fetches the object ids from the database, only once per object type, for this token.
	 * This only applies to USER token scopes, as all other tokens are not really bound
	 * by object scopes
	 *
	 * @param   {String} object_type
	 * @returns {Promise}
	 */
	this.loadObjects = (object_type) => {
		return new Promise((resolve, reject) => {
			if (Token.hasScope("user")) {
				if (
					typeof token_data.attrs.id === "undefined" ||
					!token_data.attrs.id
				) {
					reject(new errs.AuthError("User Token supplied without a User ID"));
				} else {
					const token_user_id = token_data.attrs.id ? token_data.attrs.id : 0;
					let query;

					if (typeof object_cache[object_type] === "undefined") {
						switch (object_type) {
							// USERS - should only return yourself
							case "users":
								resolve(token_user_id ? [token_user_id] : []);
								break;

							// Proxy Hosts
							case "proxy_hosts":
								query = proxyHostModel
									.query()
									.select("id")
									.andWhere("is_deleted", 0);

								if (permissions.visibility === "user") {
									query.andWhere("owner_user_id", token_user_id);
								}

								resolve(
									query.then((rows) => {
										const result = [];
										_.forEach(rows, (rule_row) => {
											result.push(rule_row.id);
										});

										// enum should not have less than 1 item
										if (!result.length) {
											result.push(0);
										}

										return result;
									}),
								);
								break;

							// DEFAULT: null
							default:
								resolve(null);
								break;
						}
					} else {
						resolve(object_cache[object_type]);
					}
				}
			} else {
				resolve(null);
			}
		}).then((objects) => {
			object_cache[object_type] = objects;
			return objects;
		});
	};

	/**
	 * Creates a schema object on the fly with the IDs and other values required to be checked against the permissionSchema
	 *
	 * @param   {String} permission_label
	 * @returns {Object}
	 */
	this.getObjectSchema = (permission_label) => {
		const base_object_type = permission_label.split(":").shift();

		const schema = {
			$id: "objects",
			description: "Actor Properties",
			type: "object",
			additionalProperties: false,
			properties: {
				user_id: {
					anyOf: [
						{
							type: "number",
							enum: [Token.get("attrs").id],
						},
					],
				},
				scope: {
					type: "string",
					pattern: `^${Token.get("scope")}$`,
				},
			},
		};

		return this.loadObjects(base_object_type).then((object_result) => {
			if (typeof object_result === "object" && object_result !== null) {
				schema.properties[base_object_type] = {
					type: "number",
					enum: object_result,
					minimum: 1,
				};
			} else {
				schema.properties[base_object_type] = {
					type: "number",
					minimum: 1,
				};
			}

			return schema;
		});
	};

	return {
		token: Token,

		/**
		 *
		 * @param   {Boolean}  [allow_internal]
		 * @returns {Promise}
		 */
		load: (allow_internal) => {
			return new Promise((resolve /*, reject*/) => {
				if (token_string) {
					resolve(Token.load(token_string));
				} else {
					allow_internal_access = allow_internal;
					resolve(allow_internal_access || null);
				}
			});
		},

		reloadObjects: this.loadObjects,

		/**
		 *
		 * @param {String}  permission
		 * @param {*}       [data]
		 * @returns {Promise}
		 */
		can: async (permission, data) => {
			if (allow_internal_access === true) {
				return true;
			}

			try {
				await this.init();
				const objectSchema = await this.getObjectSchema(permission);

				const dataSchema = {
					[permission]: {
						data: data,
						scope: Token.get("scope"),
						roles: user_roles,
						permission_visibility: permissions.visibility,
						permission_proxy_hosts: permissions.proxy_hosts,
						permission_redirection_hosts: permissions.redirection_hosts,
						permission_dead_hosts: permissions.dead_hosts,
						permission_streams: permissions.streams,
						permission_access_lists: permissions.access_lists,
						permission_certificates: permissions.certificates,
					},
				};

				const permissionSchema = {
					$async: true,
					$id: "permissions",
					type: "object",
					additionalProperties: false,
					properties: {},
				};

				const rawData = fs.readFileSync(
					`${__dirname}/access/${permission.replace(/:/gim, "-")}.json`,
					{ encoding: "utf8" },
				);
				permissionSchema.properties[permission] = JSON.parse(rawData);

				const ajv = new Ajv({
					verbose: true,
					allErrors: true,
					breakOnError: true,
					coerceTypes: true,
					schemas: [roleSchema, permsSchema, objectSchema, permissionSchema],
				});

				const valid = ajv.validate("permissions", dataSchema);
				return valid && dataSchema[permission];
			} catch (err) {
				err.permission = permission;
				err.permission_data = data;
				logger.error(permission, data, err.message);
				throw errs.PermissionError("Permission Denied", err);
			}
		},
	};
}
