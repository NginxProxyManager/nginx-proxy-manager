// Objection Docs:
// http://vincit.github.io/objection.js/

import { Model } from "objection";
import db from "../db.js";
import now from "./now_helper.js";

Model.knex(db());

class AccessListKey extends Model {
	$beforeInsert() {
		this.created_on = now();
		this.modified_on = now();

		// Default for meta
		if (typeof this.meta === "undefined") {
			this.meta = {};
		}
		if (typeof this.transports === "undefined") {
			this.transports = [];
		}
	}

	$beforeUpdate() {
		this.modified_on = now();
	}

	$parseDatabaseJson(json) {
		const thisJson = super.$parseDatabaseJson(json);
		// Postgres returns BIGINT as a string
		if (typeof thisJson.counter === "string") {
			thisJson.counter = Number.parseInt(thisJson.counter, 10);
		}
		return thisJson;
	}

	static get name() {
		return "AccessListKey";
	}

	static get tableName() {
		return "access_list_key";
	}

	static get jsonAttributes() {
		return ["transports", "meta"];
	}
}

export default AccessListKey;
