import { Model } from "objection";
import db from "../db.js";
import now from "./now_helper.js";

Model.knex(db());

class CredentialProvider extends Model {
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
		return "CredentialProvider";
	}

	static get tableName() {
		return "credential_provider";
	}

	static get jsonAttributes() {
		return ["meta"];
	}
}

export default CredentialProvider;
