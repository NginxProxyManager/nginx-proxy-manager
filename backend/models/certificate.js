// Objection Docs:
// http://vincit.github.io/objection.js/

import { Model } from "objection";
import db from "../db.js";
import { convertBoolFieldsToInt, convertIntFieldsToBool } from "../lib/helpers.js";
import deadHostModel from "./dead_host.js";
import now from "./now_helper.js";
import proxyHostModel from "./proxy_host.js";
import redirectionHostModel from "./redirection_host.js";
import streamModel from "./stream.js";
import userModel from "./user.js";

Model.knex(db());

const boolFields = ["is_deleted"];

class Certificate extends Model {
	$beforeInsert() {
		this.created_on = now();
		this.modified_on = now();

		// Default for expires_on
		if (typeof this.expires_on === "undefined") {
			this.expires_on = now();
		}

		// Default for domain_names
		if (typeof this.domain_names === "undefined") {
			this.domain_names = [];
		}

		// Default for meta
		if (typeof this.meta === "undefined") {
			this.meta = {};
		}

		this.domain_names.sort();
	}

	$beforeUpdate() {
		this.modified_on = now();

		// Sort domain_names
		if (typeof this.domain_names !== "undefined") {
			this.domain_names.sort();
		}
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
		return "Certificate";
	}

	static get tableName() {
		return "certificate";
	}

	static get jsonAttributes() {
		return ["domain_names", "meta"];
	}

	static get relationMappings() {
		return {
			owner: {
				relation: Model.HasOneRelation,
				modelClass: userModel,
				join: {
					from: "certificate.owner_user_id",
					to: "user.id",
				},
				modify: (qb) => {
					qb.where("user.is_deleted", 0);
				},
			},
			proxy_hosts: {
				relation: Model.HasManyRelation,
				modelClass: proxyHostModel,
				join: {
					from: "certificate.id",
					to: "proxy_host.certificate_id",
				},
				modify: (qb) => {
					qb.where("proxy_host.is_deleted", 0);
				},
			},
			dead_hosts: {
				relation: Model.HasManyRelation,
				modelClass: deadHostModel,
				join: {
					from: "certificate.id",
					to: "dead_host.certificate_id",
				},
				modify: (qb) => {
					qb.where("dead_host.is_deleted", 0);
				},
			},
			redirection_hosts: {
				relation: Model.HasManyRelation,
				modelClass: redirectionHostModel,
				join: {
					from: "certificate.id",
					to: "redirection_host.certificate_id",
				},
				modify: (qb) => {
					qb.where("redirection_host.is_deleted", 0);
				},
			},
			streams: {
				relation: Model.HasManyRelation,
				modelClass: streamModel,
				join: {
					from: "certificate.id",
					to: "stream.certificate_id",
				},
				modify: (qb) => {
					qb.where("stream.is_deleted", 0);
				},
			},
		};
	}
}

export default Certificate;
