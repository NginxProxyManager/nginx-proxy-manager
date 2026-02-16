import { Model } from "objection";
import db from "../db.js";
import { isSqlite } from "../lib/config.js";

Model.knex(db());

export default () => {
	if (isSqlite()) {
		return Model.raw("datetime('now','localtime')");
	}
	return Model.raw("NOW()");
};
