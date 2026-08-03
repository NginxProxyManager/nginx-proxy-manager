import { Model } from "objection";
import db from "../db.js";
import { convertBoolFieldsToInt, convertIntFieldsToBool } from "../lib/helpers.js";
import now from "./now_helper.js";

Model.knex(db());

const boolFields = ["enabled", "passive_desired_enabled", "passive_applied_enabled", "active_enabled", "follow_redirects", "tls_verify"];

class ProxyHostMonitorConfig extends Model {
	$beforeInsert() {
		this.created_on = now();
		this.modified_on = now();
	}

	$beforeUpdate() {
		this.modified_on = now();
	}

	$parseDatabaseJson(json) {
		return convertIntFieldsToBool(super.$parseDatabaseJson(json), boolFields);
	}

	$formatDatabaseJson(json) {
		return super.$formatDatabaseJson(convertBoolFieldsToInt(json, boolFields));
	}

	static get tableName() {
		return "proxy_host_monitor_config";
	}

	static get jsonAttributes() {
		return ["expected_statuses", "passive_last_error"];
	}
}

export default ProxyHostMonitorConfig;
