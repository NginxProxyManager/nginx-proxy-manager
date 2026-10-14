// Objection Docs:
// http://vincit.github.io/objection.js/

import { Model } from "objection";
import db from "../db.js";
import { convertBoolFieldsToInt, convertIntFieldsToBool } from "../lib/helpers.js";
import AccessListAuth from "./access_list_auth.js";
import AccessListClient from "./access_list_client.js";
import AccessListKey from "./access_list_key.js";
import AccessListToken from "./access_list_token.js";
import now from "./now_helper.js";
import ProxyHostModel from "./proxy_host.js";
import User from "./user.js";

Model.knex(db());

const boolFields = ["is_deleted", "satisfy_any", "pass_auth", "key_auth"];

class AccessList extends Model {
	$beforeInsert() {
		this.created_on = now();
		this.modified_on = now();

		// Default for meta
		if (typeof this.meta === "undefined") {
			this.meta = {};
		}
	}

	$beforeUpdate() {
		this.modified_on = now();
	}

	$parseDatabaseJson(json) {
		const thisJson = super.$parseDatabaseJson(json);
		// Postgres returns COUNT() as a string
		if (typeof thisJson.proxy_host_count === "string") {
			thisJson.proxy_host_count = Number.parseInt(thisJson.proxy_host_count, 10);
		}
		return convertIntFieldsToBool(thisJson, boolFields);
	}

	$formatDatabaseJson(json) {
		const thisJson = convertBoolFieldsToInt(json, boolFields);
		return super.$formatDatabaseJson(thisJson);
	}

	static get name() {
		return "AccessList";
	}

	/**
	 * Lists using security keys or header tokens are checked by the backend via
	 * auth_request, instead of nginx's own auth_basic.
	 *
	 * @param   {Object}  list
	 * @returns {Boolean}
	 */
	static isGateMode(list) {
		if (!list) {
			return false;
		}
		return list.key_auth === true || list.key_auth === 1 || (list.meta?.gate?.tokens || 0) > 0;
	}

	static get tableName() {
		return "access_list";
	}

	static get jsonAttributes() {
		return ["meta"];
	}

	static get relationMappings() {
		return {
			owner: {
				relation: Model.HasOneRelation,
				modelClass: User,
				join: {
					from: "access_list.owner_user_id",
					to: "user.id",
				},
				modify: (qb) => {
					qb.where("user.is_deleted", 0);
				},
			},
			items: {
				relation: Model.HasManyRelation,
				modelClass: AccessListAuth,
				join: {
					from: "access_list.id",
					to: "access_list_auth.access_list_id",
				},
			},
			clients: {
				relation: Model.HasManyRelation,
				modelClass: AccessListClient,
				join: {
					from: "access_list.id",
					to: "access_list_client.access_list_id",
				},
			},
			keys: {
				relation: Model.HasManyRelation,
				modelClass: AccessListKey,
				join: {
					from: "access_list.id",
					to: "access_list_key.access_list_id",
				},
				modify: (qb) => {
					// Never expose the credential material
					qb.select(
						"access_list_key.id",
						"access_list_key.created_on",
						"access_list_key.modified_on",
						"access_list_key.access_list_id",
						"access_list_key.name",
						"access_list_key.rp_id",
						"access_list_key.transports",
						"access_list_key.last_used_on",
						"access_list_key.meta",
					).orderBy("access_list_key.id");
				},
			},
			tokens: {
				relation: Model.HasManyRelation,
				modelClass: AccessListToken,
				join: {
					from: "access_list.id",
					to: "access_list_token.access_list_id",
				},
				modify: (qb) => {
					// Never expose the token hash
					qb.select(
						"access_list_token.id",
						"access_list_token.created_on",
						"access_list_token.modified_on",
						"access_list_token.access_list_id",
						"access_list_token.name",
						"access_list_token.header_name",
						"access_list_token.forward",
						"access_list_token.last_used_on",
						"access_list_token.meta",
					).orderBy("access_list_token.id");
				},
			},
			proxy_hosts: {
				relation: Model.HasManyRelation,
				modelClass: ProxyHostModel,
				join: {
					from: "access_list.id",
					to: "proxy_host.access_list_id",
				},
				modify: (qb) => {
					qb.where("proxy_host.is_deleted", 0);
				},
			},
		};
	}
}

export default AccessList;
