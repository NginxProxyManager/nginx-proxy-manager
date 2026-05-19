import { Model } from "objection";
import db from "../db.js";
import AccessList from "./access_list.js";
import Certificate from "./certificate.js";
import now from "./now_helper.js";

Model.knex(db());

class AccessListClientCAs extends Model {
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
		return "AccessListClientCAs";
	}

	static get tableName() {
		return "access_list_clientcas";
	}

	static get jsonAttributes() {
		return ["meta"];
	}

	static get relationMappings() {
		return {
			access_list: {
				relation: Model.HasOneRelation,
				modelClass: AccessList,
				join: {
					from: "access_list_clientcas.access_list_id",
					to: "access_list.id",
				},
				modify: (qb) => {
					qb.where("access_list.is_deleted", 0);
				},
			},
			certificate: {
				relation: Model.HasOneRelation,
				modelClass: Certificate,
				join: {
					from: "access_list_clientcas.certificate_id",
					to: "certificate.id",
				},
			},
		};
	}
}

export default AccessListClientCAs;
