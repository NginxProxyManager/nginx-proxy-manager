import { Model } from "objection";
import db from "../db.js";
import { convertBoolFieldsToInt, convertIntFieldsToBool } from "../lib/helpers.js";
import now from "./now_helper.js";

Model.knex(db());

const boolFields = ["backup", "down"];

class UpstreamServer extends Model {
	$beforeInsert() {
		this.created_on = now();
		this.modified_on = now();
		this.weight ??= 1;
		this.max_fails ??= 1;
		this.fail_timeout ??= "10s";
		this.sort_order ??= 0;
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

	static get name() {
		return "UpstreamServer";
	}

	static get tableName() {
		return "upstream_server";
	}
}

export default UpstreamServer;
