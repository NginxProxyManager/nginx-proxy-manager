import { Model } from "objection";
import db from "../db.js";
import now from "./now_helper.js";

Model.knex(db());

class ApiKey extends Model {
	$beforeInsert() {
		this.created_on = now();
		this.modified_on = now();
	}

	$beforeUpdate() {
		this.modified_on = now();
	}

	static get name() {
		return "ApiKey";
	}

	static get tableName() {
		return "api_key";
	}

	static get jsonAttributes() {
		return ["permissions"];
	}
}

export default ApiKey;
