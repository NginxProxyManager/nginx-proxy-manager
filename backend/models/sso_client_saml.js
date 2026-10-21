import { Model } from "objection";
import db from "../db.js";
import { castJsonIfNeed, convertBoolFieldsToInt, convertIntFieldsToBool } from "../lib/helpers.js";

Model.knex(db());

const boolFields = ["is_deleted"];

export class SAMLClientConfiguration extends Model {
	$beforeInsert() {
		// Default for meta
		if (typeof this.meta === "undefined") {
			this.meta = {};
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
		return "SAMLClientConfiguration";
	}

	static get tableName() {
		return "sso_client_saml";
	}

	static get jsonAttributes() {
		return ["meta"];
	}

	static get defaultOrder() {
		return [castJsonIfNeed("id"), "ASC"];
	}
}

export default SAMLClientConfiguration;
