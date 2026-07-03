import { Model } from "objection";
import db from "../db.js";
import now from "./now_helper.js";

Model.knex(db());

class WebhookEndpoint extends Model {
	$beforeInsert() {
		this.created_on = now();
		this.modified_on = now();
	}

	$beforeUpdate() {
		this.modified_on = now();
	}

	static get name() {
		return "WebhookEndpoint";
	}

	static get tableName() {
		return "webhook_endpoint";
	}

	static get jsonAttributes() {
		return ["events"];
	}
}

export default WebhookEndpoint;
