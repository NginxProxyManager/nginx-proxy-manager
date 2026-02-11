// Objection Docs:
// http://vincit.github.io/objection.js/

import { Model } from "objection";
import db from "../db.js";
import { convertBoolFieldsToInt, convertIntFieldsToBool } from "../lib/helpers.js";
import now from "./now_helper.js";
import User from "./user.js";

Model.knex(db());

const boolFields = ["is_deleted", "backed_up"];

class WebauthnCredential extends Model {
	$beforeInsert() {
		this.created_on = now();
		this.modified_on = now();

		if (typeof this.transports === "undefined") {
			this.transports = [];
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
		return "WebauthnCredential";
	}

	static get tableName() {
		return "webauthn_credential";
	}

	static get jsonAttributes() {
		return ["transports"];
	}

	static get relationMappings() {
		return {
			user: {
				relation: Model.BelongsToOneRelation,
				modelClass: User,
				join: {
					from: "webauthn_credential.user_id",
					to: "user.id",
				},
				filter: {
					is_deleted: 0,
				},
			},
		};
	}
}

export default WebauthnCredential;
