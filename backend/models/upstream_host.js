// Objection Docs:
// http://vincit.github.io/objection.js/

import { Model } from "objection";
import db from "../db.js";
import { convertBoolFieldsToInt, convertIntFieldsToBool } from "../lib/helpers.js";
import now from "./now_helper.js";
import UpstreamHostServer from "./upstream_host_server.js";
import ProxyHostModel from "./proxy_host.js";
import User from "./user.js";

Model.knex(db());

const boolFields = ["is_deleted"];

class UpstreamHost extends Model {
	$beforeInsert() {
		this.created_on = now();
		this.modified_on = now();
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
		return "UpstreamHost";
	}

	static get tableName() {
		return "upstream_host";
	}

	static get jsonAttributes() {
		return ["meta"];
	}

	static get defaultAllowGraph() {
		return "[owner,servers,proxy_hosts]";
	}

	static get defaultExpand() {
		return ["owner", "servers"];
	}

	static get defaultOrder() {
		return ["name", "ASC"];
	}

	static get relationMappings() {
		return {
			owner: {
				relation: Model.HasOneRelation,
				modelClass: User,
				join: {
					from: "upstream_host.owner_user_id",
					to: "user.id",
				},
				modify: (qb) => {
					qb.where("user.is_deleted", 0);
				},
			},
			servers: {
				relation: Model.HasManyRelation,
				modelClass: UpstreamHostServer,
				join: {
					from: "upstream_host.id",
					to: "upstream_host_server.upstream_host_id",
				},
			},
			proxy_hosts: {
				relation: Model.HasManyRelation,
				modelClass: ProxyHostModel,
				join: {
					from: "upstream_host.id",
					to: "proxy_host.upstream_host_id",
				},
				modify: (qb) => {
					qb.where("proxy_host.is_deleted", 0);
				},
			},
		};
	}
}

export default UpstreamHost;
