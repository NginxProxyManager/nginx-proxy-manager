import { Model } from "objection";
import db from "../db.js";
import now from "./now_helper.js";

Model.knex(db());

class NginxDeployment extends Model {
	$beforeInsert() {
		const timestamp = now();
		this.created_on ??= timestamp;
		this.modified_on ??= timestamp;
		this.started_on ??= timestamp;
	}

	$beforeUpdate() {
		this.modified_on = now();
	}

	static get tableName() {
		return "nginx_deployment";
	}

	static get jsonAttributes() {
		return ["diagnostics", "journal_summary"];
	}
}

export default NginxDeployment;
