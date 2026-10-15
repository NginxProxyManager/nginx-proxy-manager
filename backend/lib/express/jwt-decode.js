import Access from "../access.js";
import errs from "../error.js";
import internalApiKey from "../../internal/api-key.js";
import userModel from "../../models/user.js";
import TokenModel from "../../models/token.js";

export default () => {
	return async (_, res, next) => {
		try {
			res.locals.access = null;
			let token = res.locals.token || null;
			let permissionsOverride = null;

			if (res.locals.apiKey) {
				const apiKeyRow = await internalApiKey.authenticate(res.locals.apiKey);
				const user = await userModel
					.query()
					.where("id", apiKeyRow.owner_user_id)
					.andWhere("is_deleted", 0)
					.andWhere("is_disabled", 0)
					.first();

				if (!user) {
					throw new errs.AuthError("API key owner not found");
				}

				const Token = TokenModel();
				const signed = await Token.create({
					iss: "api-key",
					scope: ["user"],
					attrs: { id: user.id },
					expiresIn: "1h",
				});
				token = signed.token;
				permissionsOverride = apiKeyRow.permissions;
			}

			const access = new Access(token, permissionsOverride);
			await access.load();
			res.locals.access = access;
			next();
		} catch (err) {
			next(err);
		}
	};
};
