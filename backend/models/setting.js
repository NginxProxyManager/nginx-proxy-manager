// Objection Docs:
// http://vincit.github.io/objection.js/

import { Model } from "objection";
import db from "../db.js";

Model.knex(db());

class Setting extends Model {
	$beforeInsert () {
		// Default for meta
		if (typeof this.meta === 'undefined') {
			this.meta = {};
		}
	}

	static get name () {
		return 'Setting';
	}

	static get tableName () {
		return 'setting';
	}

	static get jsonAttributes () {
		return ['meta'];
	}
}

export default Setting;
