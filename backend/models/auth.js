// Objection Docs:
// http://vincit.github.io/objection.js/

import crypto from "node:crypto";
import bcrypt from "bcrypt";
import { Model } from "objection";
import db from "../db.js";
import { convertBoolFieldsToInt, convertIntFieldsToBool } from "../lib/helpers.js";
import now from "./now_helper.js";
import User from "./user.js";

Model.knex(db());

const boolFields = ["is_deleted"];
const saltRounds = 13;

// A hash of a random value, for a login that names an account with no password to check it against. Hashed
// with the same cost as real passwords, and made at startup so the first such login takes no longer either.
const dummyHash = bcrypt.hash(crypto.randomBytes(32).toString("hex"), saltRounds);

function encryptPassword() {
	if (this.type === "password" && this.secret) {
		return bcrypt.hash(this.secret, saltRounds).then((hash) => {
			this.secret = hash;
		});
	}

	return null;
}

class Auth extends Model {
	$beforeInsert(queryContext) {
		this.created_on = now();
		this.modified_on = now();

		// Default for meta
		if (typeof this.meta === "undefined") {
			this.meta = {};
		}

		return encryptPassword.apply(this, queryContext);
	}

	$beforeUpdate(queryContext) {
		this.modified_on = now();
		return encryptPassword.apply(this, queryContext);
	}

	$parseDatabaseJson(json) {
		const thisJson = super.$parseDatabaseJson(json);
		return convertIntFieldsToBool(thisJson, boolFields);
	}

	$formatDatabaseJson(json) {
		const thisJson = convertBoolFieldsToInt(json, boolFields);
		return super.$formatDatabaseJson(thisJson);
	}

	/**
	 * Verify a plain password against the encrypted password
	 *
	 * @param {String} password
	 * @returns {Promise}
	 */
	verifyPassword(password) {
		return bcrypt.compare(password, this.secret);
	}

	/**
	 * Take as long as verifyPassword does, then fail. bcrypt is nearly all of the time a login takes, so a login
	 * that skipped it for an unknown account would answer far sooner, and say which accounts exist.
	 *
	 * @param {String} password
	 * @returns {Promise<false>}
	 */
	static async verifyDummyPassword(password) {
		await bcrypt.compare(password, await dummyHash);
		return false;
	}

	static get name() {
		return "Auth";
	}

	static get tableName() {
		return "auth";
	}

	static get jsonAttributes() {
		return ["meta"];
	}

	static get relationMappings() {
		return {
			user: {
				relation: Model.HasOneRelation,
				modelClass: User,
				join: {
					from: "auth.user_id",
					to: "user.id",
				},
				filter: {
					is_deleted: 0,
				},
			},
		};
	}
}

export default Auth;
