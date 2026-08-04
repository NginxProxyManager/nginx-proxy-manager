import { Model } from "objection";
import db from "../db.js";
import now from "./now_helper.js";

Model.knex(db());

class ProxyHostUpstream extends Model {
	$beforeInsert() {
		this.created_on = now();
	}

	static get name() {
		return "ProxyHostUpstream";
	}

	static get tableName() {
		return "proxy_host_upstream";
	}
}

export default ProxyHostUpstream;
