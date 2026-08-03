import { Model } from "objection";
import db from "../db.js";

Model.knex(db());

class ProxyHostMonitorState extends Model {
	static get tableName() {
		return "proxy_host_monitor_state";
	}

	static get idColumn() {
		return "proxy_host_id";
	}

	static get jsonAttributes() {
		return ["summary_5m", "summary_24h"];
	}
}

export default ProxyHostMonitorState;
