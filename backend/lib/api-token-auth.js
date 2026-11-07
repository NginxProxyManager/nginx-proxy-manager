import apiTokenModel from "../models/api_token.js";
import authModel from "../models/auth.js";
import userModel from "../models/user.js";
import { tokenPattern, tokenStatus, verifySecret } from "./api-token-policy.js";

export const invalidToken = () =>
	Object.assign(new Error("Invalid or expired API token"), { status: 401, public: true });
export const loadApiToken = async (value) => {
	const match = tokenPattern.exec(value);
	if (!match) throw invalidToken();
	const row = await apiTokenModel.query().findOne("public_id", match[1]);
	if (!row || !verifySecret(match[2], row.secret_hash)) throw invalidToken();
	const user = await userModel.query().findById(row.owner_user_id).where("is_deleted", 0).where("is_disabled", 0);
	const auth = await authModel.query().findOne({ user_id: row.owner_user_id, type: "password" });
	if (tokenStatus(row, user, auth) !== "active") throw invalidToken();
	// Usage metadata is throttled, never an authorization cache.
	if (!row.last_used_on || Date.now() - new Date(row.last_used_on).getTime() > 60000) {
		await apiTokenModel.query().findById(row.id).patch({ last_used_on: new Date().toISOString() });
	}
	return row;
};
