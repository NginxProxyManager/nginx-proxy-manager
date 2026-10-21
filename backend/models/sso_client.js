import { Model } from "objection";
import db from "../db.js";
import { castJsonIfNeed, convertBoolFieldsToInt, convertIntFieldsToBool } from "../lib/helpers.js";
import now from "./now_helper.js";
import OpenIDClientConfiguration from "./sso_client_openid.js";
import User from "./user.js";
import { SAMLClientConfiguration } from "./sso_client_saml.js";

Model.knex(db());

const boolFields = ["is_deleted", "enabled"];

export const SingleSignOnClientType = {
	OpenID: "OAuth2/OpenID",
	SAML: "SAML",
};

class SingleSignOnClient extends Model {
	$beforeInsert() {
		this.created_on = now();
		this.modified_on = now();
		// Default for meta
		if (typeof this.meta === "undefined") {
			this.meta = {};
		}
	}

	$beforeUpdate() {
		this.modified_on = now();
	}

	$parseDatabaseJson(json) {
		const thisJson = super.$parseDatabaseJson(json);
		return convertIntFieldsToBool(thisJson, boolFields);
	}

	$formatDatabaseJson(json) {
		const thisJson = convertBoolFieldsToInt(json, boolFields);
		return super.$formatDatabaseJson(thisJson);
	}

	static get name() {
		return "SingleSignOnClient";
	}

	static get tableName() {
		return "sso_client";
	}

	static get jsonAttributes() {
		return ["meta"];
	}

	static get defaultExpand() {
		return ["owner"];
	}

	static get defaultOrder() {
		return [castJsonIfNeed("name"), "ASC"];
	}

	static get enabledProtocols() {
		return [SingleSignOnClientType.OpenID];
	}

	static get relationMappings() {
		return {
			owner: {
				relation: Model.HasOneRelation,
				modelClass: User,
				join: {
					from: "sso_client.owner_user_id",
					to: "user.id",
				},
				modify: (qb) => {
					qb.where("user.is_deleted", 0);
				},
			},
			configuration_openid: {
				relation: Model.HasOneRelation,
				modelClass: OpenIDClientConfiguration,
				join: {
					from: "sso_client_openid.sso_client_id",
					to: "sso_client.id",
				},
			},
			configuration_saml: {
				relation: Model.HasOneRelation,
				modelClass: SAMLClientConfiguration,
				join: {
					from: "sso_client_saml.sso_client_id",
					to: "sso_client.id",
				},
			},
		};
	}
}

export default SingleSignOnClient;
