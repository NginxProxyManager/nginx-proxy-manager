// Objection Docs:
// http://vincit.github.io/objection.js/

import { Model } from "objection";
import db from "../db.js";
import { convertBoolFieldsToInt, convertIntFieldsToBool } from "../lib/helpers.js";
import now from "./now_helper.js";

Model.knex(db());

const boolFields = ["enabled", "tls_verify", "starttls"];

class LdapConfig extends Model {
	$beforeInsert() {
		this.created_on  = now();
		this.modified_on = now();

		// Defaults
		if (typeof this.enabled === "undefined") {
			this.enabled = false;
		}
		if (typeof this.tls_verify === "undefined") {
			this.tls_verify = true;
		}
		if (typeof this.starttls === "undefined") {
			this.starttls = false;
		}
		if (typeof this.user_attribute === "undefined") {
			this.user_attribute = "uid";
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
		return "LdapConfig";
	}

	static get tableName() {
		return "ldap_config";
	}
}

export default LdapConfig;
