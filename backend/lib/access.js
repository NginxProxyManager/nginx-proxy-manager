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

export default function (tokenString) {
	const Token = TokenModel();
	let tokenData = null;
	let initialised = false;
	const objectCache = {};
	let allowInternalAccess = false;
	let userRoles = [];
	let permissions = {};

	/**
	 * Loads the Token object from the token string
	 *
	 * @returns {Promise}
	 */
	this.init = async () => {
		if (initialised) {
			return;
		}

		if (!tokenString) {
			throw new errs.PermissionError("Permission Denied");
		}

		tokenData = await Token.load(tokenString);

		// At this point we need to load the user from the DB and make sure they:
		// - exist (and not soft deleted)
		// - still have the appropriate scopes for this token
		// This is only required when the User ID is supplied or if the token scope has `user`
		if (
			tokenData.attrs.id ||
			(typeof tokenData.scope !== "undefined" && _.indexOf(tokenData.scope, "user") !== -1)
		) {
			// Has token user id or token user scope
			const user = await userModel
				.query()
				.where("id", tokenData.attrs.id)
				.andWhere("is_deleted", 0)
				.andWhere("is_disabled", 0)
				.allowGraph("[permissions]")
				.withGraphFetched("[permissions]")
				.first();

			if (user) {
				// make sure user has all scopes of the token
				// The `user` role is not added against the user row, so we have to just add it here to get past this check.
				user.roles.push("user");

				let ok = true;
				_.forEach(tokenData.scope, (scope_item) => {
					if (_.indexOf(user.roles, scope_item) === -1) {
						ok = false;
					}
				});

				if (!ok) {
					throw new errs.AuthError("Invalid token scope for User");
				}
				initialised = true;
				userRoles = user.roles;
				permissions = user.permissions;
			} else {
				throw new errs.AuthError("User cannot be loaded for Token");
			}
		}
		initialised = true;
	};

	/**
	 * Fetches the object ids from the database, only once per object type, for this token.
	 * This only applies to USER token scopes, as all other tokens are not really bound
	 * by object scopes
	 *
	 * @param   {String} objectType
	 * @returns {Promise}
	 */
	this.loadObjects = async (objectType) => {
		let objects = null;

		if (Token.hasScope("user")) {
			if (typeof tokenData.attrs.id === "undefined" || !tokenData.attrs.id) {
				throw new errs.AuthError("User Token supplied without a User ID");
			}

			const tokenUserId = tokenData.attrs.id ? tokenData.attrs.id : 0;

			if (typeof objectCache[objectType] !== "undefined") {
				objects = objectCache[objectType];
			} else {
				switch (objectType) {
					// USERS - should only return yourself
					case "users":
						objects = tokenUserId ? [tokenUserId] : [];
						break;

					// Proxy Hosts
					case "proxy_hosts": {
						const query = proxyHostModel
							.query()
							.select("id")
							.andWhere("is_deleted", 0);

						if (permissions.visibility === "user") {
							query.andWhere("owner_user_id", tokenUserId);
						}

						const rows = await query;
						objects = [];
						_.forEach(rows, (ruleRow) => {
							objects.push(ruleRow.id);
						});

						// enum should not have less than 1 item
						if (!objects.length) {
							objects.push(0);
						}
						break;
					}
				}
				objectCache[objectType] = objects;
			}
		}
		return objects;
	};

	/**
	 * Creates a schema object on the fly with the IDs and other values required to be checked against the permissionSchema
	 *
	 * @param   {String} permissionLabel
	 * @returns {Object}
	 */
	this.getObjectSchema = async (permissionLabel) => {
		const baseObjectType = permissionLabel.split(":").shift();

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

		const result = await this.loadObjects(baseObjectType);
		if (typeof result === "object" && result !== null) {
			schema.properties[baseObjectType] = {
				type: "number",
				enum: result,
				minimum: 1,
			};
		} else {
			schema.properties[baseObjectType] = {
				type: "number",
				minimum: 1,
			};
		}

		return schema;
	};

	// here:

	return {
		token: Token,

		/**
		 *
		 * @param   {Boolean}  [allowInternal]
		 * @returns {Promise}
		 */
		load: async (allowInternal) => {
			if (tokenString) {
				return await Token.load(tokenString);
			}
			allowInternalAccess = allowInternal;
			return allowInternal || null;
		},

		reloadObjects: this.loadObjects,

		/**
		 *
		 * @param {String}  permission
		 * @param {*}       [data]
		 * @returns {Promise}
		 */
		can: async (permission, data) => {
			if (allowInternalAccess === true) {
				return true;
			}

			try {
				await this.init();
				const objectSchema = await this.getObjectSchema(permission);

				const dataSchema = {
					[permission]: {
						data: data,
						scope: Token.get("scope"),
						roles: userRoles,
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

				const rawData = fs.readFileSync(`${__dirname}/access/${permission.replace(/:/gim, "-")}.json`, {
					encoding: "utf8",
				});
				permissionSchema.properties[permission] = JSON.parse(rawData);

				const ajv = new Ajv({
					verbose: true,
					allErrors: true,
					breakOnError: true,
					coerceTypes: true,
					schemas: [roleSchema, permsSchema, objectSchema, permissionSchema],
				});

				const valid = await ajv.validate("permissions", dataSchema);
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
