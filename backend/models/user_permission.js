// Objection Docs:
// http://vincit.github.io/objection.js/

import { Model } from "objection";
import db from "../db.js";
import now from "./now_helper.js";

Model.knex(db());

class UserPermission extends Model {
	$beforeInsert () {
		this.created_on  = now();
		this.modified_on = now();
	}

	$beforeUpdate () {
		this.modified_on = now();
	}

	static get name () {
		return 'UserPermission';
	}

	static get tableName () {
		return 'user_permission';
	}
}

export default UserPermission;
