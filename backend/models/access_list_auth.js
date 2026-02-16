// Objection Docs:
// http://vincit.github.io/objection.js/

import { Model } from "objection";
import db from "../db.js";
import accessListModel from "./access_list.js";
import now from "./now_helper.js";

Model.knex(db());

class AccessListAuth extends Model {
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

	static get name() {
		return "AccessListAuth";
	}

	static get tableName() {
		return "access_list_auth";
	}

	static get jsonAttributes() {
		return ["meta"];
	}

	static get relationMappings() {
		return {
			access_list: {
				relation: Model.HasOneRelation,
				modelClass: accessListModel,
				join: {
					from: "access_list_auth.access_list_id",
					to: "access_list.id",
				},
				modify: (qb) => {
					qb.where("access_list.is_deleted", 0);
				},
			},
		};
	}
}

export default AccessListAuth;
