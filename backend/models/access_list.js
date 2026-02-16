// Objection Docs:
// http://vincit.github.io/objection.js/

import { Model } from "objection";
import db from "../db.js";
import { convertBoolFieldsToInt, convertIntFieldsToBool } from "../lib/helpers.js";
import AccessListAuth from "./access_list_auth.js";
import AccessListClient from "./access_list_client.js";
import now from "./now_helper.js";
import ProxyHostModel from "./proxy_host.js";
import User from "./user.js";

Model.knex(db());

const boolFields = ["is_deleted", "satisfy_any", "pass_auth"];

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
		return convertIntFieldsToBool(thisJson, boolFields);
	}

	$formatDatabaseJson(json) {
		const thisJson = convertBoolFieldsToInt(json, boolFields);
		return super.$formatDatabaseJson(thisJson);
	}

	static get name() {
		return "AccessList";
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
