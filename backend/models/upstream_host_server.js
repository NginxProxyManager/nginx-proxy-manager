// Objection Docs:
// http://vincit.github.io/objection.js/

import { Model } from "objection";
import db from "../db.js";
import upstreamHostModel from "./upstream_host.js";
import now from "./now_helper.js";

Model.knex(db());

class UpstreamHostServer extends Model {
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

	static get name() {
		return "UpstreamHostServer";
	}

	static get tableName() {
		return "upstream_host_server";
	}

	static get jsonAttributes() {
		return ["meta"];
	}

	static get relationMappings() {
		return {
			upstream_host: {
				relation: Model.HasOneRelation,
				modelClass: upstreamHostModel,
				join: {
					from: "upstream_host_server.upstream_host_id",
					to: "upstream_host.id",
				},
				modify: (qb) => {
					qb.where("upstream_host.is_deleted", 0);
				},
			},
		};
	}
}

export default UpstreamHostServer;
