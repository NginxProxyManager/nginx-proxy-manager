import { Model } from "objection";
import db from "../db.js";
import { convertBoolFieldsToInt, convertIntFieldsToBool } from "../lib/helpers.js";
import now from "./now_helper.js";
import UpstreamServer from "./upstream_server.js";
import User from "./user.js";

Model.knex(db());

const boolFields = ["is_deleted", "is_disabled", "nginx_applied_enabled"];

class Upstream extends Model {
	$beforeInsert() {
		this.created_on = now();
		this.modified_on = now();
		this.nginx_config_revision ??= 1;
		this.load_balancing_method ??= "round_robin";
		this.zone_size ??= "64k";
		this.nginx_deployment_status ??= "pending";
	}

	$beforeUpdate() {
		this.modified_on = now();
	}

	$parseDatabaseJson(json) {
		return convertIntFieldsToBool(super.$parseDatabaseJson(json), boolFields);
	}

	$formatDatabaseJson(json) {
		return super.$formatDatabaseJson(convertBoolFieldsToInt(json, boolFields));
	}

	static get name() {
		return "Upstream";
	}

	static get tableName() {
		return "upstream";
	}

	static get jsonAttributes() {
		return ["nginx_last_error", "nginx_applied_snapshot"];
	}

	static get defaultAllowGraph() {
		return "[owner,servers]";
	}

	static get defaultExpand() {
		return ["owner", "servers"];
	}

	static get relationMappings() {
		return {
			owner: {
				relation: Model.HasOneRelation,
				modelClass: User,
				join: { from: "upstream.owner_user_id", to: "user.id" },
				modify: (qb) => qb.where("user.is_deleted", 0),
			},
			servers: {
				relation: Model.HasManyRelation,
				modelClass: UpstreamServer,
				join: { from: "upstream.id", to: "upstream_server.upstream_id" },
				modify: (qb) => qb.orderBy("sort_order", "ASC").orderBy("id", "ASC"),
			},
		};
	}
}

export default Upstream;
