import { Model } from "objection";
import db from "../db.js";
import now from "./now_helper.js";

Model.knex(db());

class Job extends Model {
	$beforeInsert() {
		this.created_on = now();
		this.modified_on = now();
	}

	$beforeUpdate() {
		this.modified_on = now();
	}

	static get name() {
		return "Job";
	}

	static get tableName() {
		return "job";
	}

	static get jsonAttributes() {
		return ["payload", "result"];
	}
}

export default Job;
