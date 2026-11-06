import { Model } from "objection";
import db from "../db.js";
import { castJsonIfNeed, convertBoolFieldsToInt, convertIntFieldsToBool } from "../lib/helpers.js";
import now from "./now_helper.js";
import Auth0ClientConfiguration from "./sso_client_auth0.js";
import GitHubConfiguration from "./sso_client_github.js";
import OpenIDClientConfiguration from "./sso_client_openid.js";
import SAMLClientConfiguration from "./sso_client_saml.js";
import User from "./user.js";

Model.knex(db());

const boolFields = [
	"is_deleted",
	"enabled",
	"allow_internal",
	"allow_internal_if_admin",
	"require_group",
	"provision_users",
	"require_provision_group",
	"require_verified_email",
];

export const SingleSignOnClientType = {
	Auth0: "Auth0",
	GitHub: "GitHub",
	OpenID: "OpenID",
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

	static configByType(type) {
		return [`configuration_${String(type).toLocaleLowerCase()}`];
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
		return [SingleSignOnClientType.Auth0, SingleSignOnClientType.GitHub, SingleSignOnClientType.OpenID];
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
			configuration_auth0: {
				relation: Model.HasOneRelation,
				modelClass: Auth0ClientConfiguration,
				join: {
					from: "sso_client_auth0.sso_client_id",
					to: "sso_client.id",
				},
			},
			configuration_github: {
				relation: Model.HasOneRelation,
				modelClass: GitHubConfiguration,
				join: {
					from: "sso_client_github.sso_client_id",
					to: "sso_client.id",
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
