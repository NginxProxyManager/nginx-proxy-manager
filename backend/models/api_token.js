import { Model } from "objection";
import db from "../db.js";

Model.knex(db());
class ApiToken extends Model {
	static get tableName() {
		return "api_token";
	}
	static get jsonAttributes() {
		return ["scopes"];
	}
}
export default ApiToken;
