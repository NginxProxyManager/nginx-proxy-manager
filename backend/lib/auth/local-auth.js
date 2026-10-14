/**
 * Whether email/password sign in is available at all.
 *
 * This lives on its own rather than in `internal/auth-provider.js` because
 * provisioning needs to know the answer: an administrator whose only
 * credential is a password is no fallback when local sign in is switched off,
 * and the lockout guards have to account for that.
 */

import { auth as logger } from "../../logger.js";
import authProviderModel from "../../models/auth_provider.js";
import settingModel from "../../models/setting.js";

const LOCAL_AUTH_SETTING = "auth-local";

/**
 * Whether local sign in has been switched off by environment. When unset, the
 * stored setting decides.
 *
 * @returns {Boolean|null}
 */
const localAuthDisabledByEnv = () => {
	const value = process.env.AUTH_DISABLE_LOCAL;
	if (typeof value === "undefined" || value === "") {
		return null;
	}
	return /^(1|true|yes|on)$/i.test(String(value).trim());
};

/**
 * @returns {Promise<Boolean>}
 */
const isLocalAuthEnabled = async () => {
	const fromEnv = localAuthDisabledByEnv();
	if (fromEnv !== null) {
		return !fromEnv;
	}

	const row = await settingModel.query().where("id", LOCAL_AUTH_SETTING).first();
	// Missing row means the migration hasn't been seen yet; fail open so
	// nobody gets locked out of their own instance.
	return row?.value !== "disabled";
};

/**
 * Puts the password form back when it is the only thing left.
 *
 * Local sign in can only be switched off while a provider is available to take
 * its place. Once the last one is removed that is no longer true, and an
 * instance with neither is one nobody can sign in to at all. Called after a
 * provider goes away, whether from the UI or because its variables did.
 *
 * @returns {Promise<Boolean>} whether local sign in was turned back on
 */
const ensureAWayBackIn = async () => {
	if (await isLocalAuthEnabled()) {
		return false;
	}

	const remaining = await authProviderModel.query().where("is_enabled", 1).andWhere("is_deleted", 0);
	if (remaining.length) {
		return false;
	}

	if (localAuthDisabledByEnv() !== null) {
		// The environment wins, so all we can do is say what has happened
		logger.error(
			"The last authentication provider is gone and AUTH_DISABLE_LOCAL is set, so nobody can sign in. " +
				"Unset AUTH_DISABLE_LOCAL and restart.",
		);
		return false;
	}

	await settingModel.query().where("id", LOCAL_AUTH_SETTING).patch({ value: "enabled" });
	logger.warn("Local sign in was turned back on: the last authentication provider has been removed");
	return true;
};

export { ensureAWayBackIn, isLocalAuthEnabled, LOCAL_AUTH_SETTING, localAuthDisabledByEnv };
