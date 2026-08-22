import gravatar from "gravatar";
import { auth as logger } from "../../logger.js";
import authModel from "../../models/auth.js";
import userModel from "../../models/user.js";
import userPermissionModel from "../../models/user_permission.js";
import errs from "../error.js";

/**
 * Works out which roles an externally authenticated user should hold.
 *
 * Roles are only recalculated when the provider has an admin group configured;
 * without one, roles stay entirely under the control of the Users screen.
 *
 * @param   {Object}   provider
 * @param   {Object}   identity
 * @param   {[String]} currentRoles
 * @returns {[String]|null} the new roles, or null to leave them alone
 */
const resolveRoles = (provider, identity, currentRoles) => {
	const adminGroup = (provider.meta?.admin_group || "").trim();
	if (!adminGroup) {
		return null;
	}

	const groups = (identity.groups || []).map((g) => String(g).toLowerCase());
	const isAdmin = groups.includes(adminGroup.toLowerCase());

	const roles = new Set(currentRoles || []);
	if (isAdmin) {
		roles.add("admin");
	} else {
		roles.delete("admin");
	}

	return Array.from(roles);
};

/**
 * Roles to give a brand new user, before any group mapping is applied.
 *
 * @param   {Object} provider
 * @returns {[String]}
 */
const initialRoles = (provider) => {
	const configured = provider.meta?.default_roles;
	return Array.isArray(configured) ? [...configured] : [];
};

const createPermissions = (userId, isAdmin) =>
	userPermissionModel.query().insert({
		user_id: userId,
		visibility: isAdmin ? "all" : "user",
		proxy_hosts: "manage",
		redirection_hosts: "manage",
		dead_hosts: "manage",
		streams: "manage",
		access_lists: "manage",
		certificates: "manage",
	});

/**
 * Turns a verified external identity into a local user row, creating or linking
 * one as the provider's configuration allows.
 *
 * @param   {Object}  provider
 * @param   {Object}  identity
 * @param   {String}  identity.identifier  Stable id at the provider (GUID, sub, nameID, or DN)
 * @param   {String}  identity.email
 * @param   {String}  [identity.name]
 * @param   {String}  [identity.nickname]
 * @param   {[String]} [identity.groups]
 * @param   {Object}  [options]
 * @param   {Boolean} [options.forceCreate]  Create even when auto_create_user is off.
 *                                           Directory sync sets this: creating accounts
 *                                           ahead of first login is the point of it.
 * @returns {Promise<Object>} the user row
 */
const resolveUser = async (provider, identity, options = {}) => {
	const email = String(identity.email || "")
		.toLowerCase()
		.trim();

	if (!email) {
		throw new errs.AuthError("The authentication provider did not supply an email address");
	}

	// 1. An identity we've seen before
	const existingAuth = await authModel
		.query()
		.where("provider_id", provider.id)
		.andWhere("identifier", identity.identifier)
		.andWhere("is_deleted", 0)
		.first();

	let user = null;

	if (existingAuth) {
		user = await userModel.query().where("id", existingAuth.user_id).andWhere("is_deleted", 0).first();
	}

	// 2. Otherwise match an existing local user by email address
	if (!user) {
		user = await userModel.query().where("email", email).andWhere("is_deleted", 0).first();
	}

	// 3. Otherwise create one, if the provider is allowed to
	if (!user) {
		if (!options.forceCreate && !provider.meta?.auto_create_user) {
			logger.info(`Rejected login for unknown user ${email} from provider ${provider.name}`);
			throw new errs.AuthError("No account exists for this user", "error.no-account-for-external-user");
		}

		const roles = resolveRoles(provider, identity, initialRoles(provider)) ?? initialRoles(provider);

		user = await userModel.query().insertAndFetch({
			is_deleted: 0,
			is_disabled: 0,
			email,
			name: identity.name || email,
			nickname: identity.nickname || identity.name || email,
			avatar: gravatar.url(email, { default: "mm" }),
			roles,
		});

		await createPermissions(user.id, roles.includes("admin"));
		logger.info(`Created user ${email} from provider ${provider.name}`);
	} else {
		if (user.is_disabled) {
			throw new errs.AuthError("This account is disabled");
		}

		// Keep roles in sync when the provider maps an admin group
		const roles = resolveRoles(provider, identity, user.roles);
		if (roles && !sameRoles(roles, user.roles)) {
			await userModel.query().where("id", user.id).patch({ roles });
			logger.info(`Updated roles for ${email} from provider ${provider.name}: [${roles.join(", ")}]`);
			user.roles = roles;

			// Admins need to be able to see everything they administer
			if (roles.includes("admin")) {
				await userPermissionModel.query().where("user_id", user.id).patch({ visibility: "all" });
			}
		}

		// A user created before this provider existed may have no permissions row
		const permissions = await userPermissionModel.query().where("user_id", user.id).first();
		if (!permissions) {
			await createPermissions(user.id, (user.roles || []).includes("admin"));
		}
	}

	// 4. Record the link so the next login matches on identifier rather than email
	await linkIdentity(provider, user, identity);

	return user;
};

const sameRoles = (a, b) => {
	const left = [...(a || [])].sort();
	const right = [...(b || [])].sort();
	return left.length === right.length && left.every((v, i) => v === right[i]);
};

/**
 * Creates or refreshes the auth row that ties a user to an external identity.
 *
 * @param   {Object} provider
 * @param   {Object} user
 * @param   {Object} identity
 * @returns {Promise}
 */
const linkIdentity = async (provider, user, identity) => {
	const meta = {
		email: identity.email,
		name: identity.name || null,
		groups: identity.groups || [],
		provider_slug: provider.slug,
		// Kept for troubleshooting: the identifier is normally an opaque GUID,
		// so the DN is the only human readable pointer back to the directory
		dn: identity.dn || null,
		identifier_source: identity.identifier_source || null,
		seen_on: new Date().toISOString(),
	};

	const existing = await authModel
		.query()
		.where("user_id", user.id)
		.andWhere("provider_id", provider.id)
		.andWhere("is_deleted", 0)
		.first();

	if (existing) {
		return await authModel.query().where("id", existing.id).patch({
			identifier: identity.identifier,
			meta,
		});
	}

	return await authModel.query().insert({
		user_id: user.id,
		provider_id: provider.id,
		identifier: identity.identifier,
		type: provider.type,
		// Not a credential we can authenticate with; the provider holds it
		secret: "",
		meta,
	});
};

/**
 * Releases the accounts a provider owns, when that provider goes away.
 *
 * Without this, removing a provider strands everyone it created: their link
 * points at a provider that no longer exists and they hold no password, so
 * nobody can sign in as them and nothing says why.
 *
 * Two outcomes are offered:
 *
 * - `convert` keeps the accounts and drops the link. They become local accounts
 *   with no password set, which an administrator can then set from the Users
 *   screen. Hosts, permissions and ownership are untouched.
 * - `delete` removes the accounts too, but only those that would otherwise be
 *   left with no way in at all.
 *
 * @param   {Object} provider
 * @param   {String} action  "convert" or "delete"
 * @returns {Promise<Object>} { converted, deleted, kept }
 */
const detachProviderUsers = async (provider, action = "convert") => {
	const links = await authModel.query().where("provider_id", provider.id).andWhere("is_deleted", 0);

	let converted = 0;
	let deleted = 0;
	const kept = [];

	for (const link of links) {
		await authModel.query().where("id", link.id).patch({ is_deleted: true });

		const user = await userModel.query().where("id", link.user_id).andWhere("is_deleted", 0).first();
		if (!user) {
			continue;
		}

		if (action !== "delete") {
			converted++;
			continue;
		}

		// Somebody who also signs in with a password, or through another
		// provider, is not ours to remove
		const remaining = await authModel.query().where("user_id", user.id).andWhere("is_deleted", 0).first();
		if (remaining) {
			converted++;
			kept.push({ id: user.id, email: user.email, reason: "has another way to sign in" });
			continue;
		}

		// Deleting the last administrator would leave nobody able to administer
		// the instance, which is never what someone means to do
		if ((user.roles || []).includes("admin")) {
			const others = await userModel
				.query()
				.where("is_deleted", 0)
				.andWhere("is_disabled", 0)
				.andWhere("id", "!=", user.id);

			if (!others.some((u) => (u.roles || []).includes("admin"))) {
				converted++;
				kept.push({ id: user.id, email: user.email, reason: "is the only administrator" });
				logger.warn(
					`Keeping ${user.email} while removing "${provider.name}": they are the only administrator left`,
				);
				continue;
			}
		}

		await userModel.query().where("id", user.id).patch({ is_deleted: 1 });
		deleted++;
	}

	logger.info(
		`Removing provider "${provider.name}": ${converted} account(s) converted to local, ${deleted} deleted` +
			(kept.length ? `, ${kept.length} kept` : ""),
	);

	return { converted, deleted, kept };
};

export { detachProviderUsers, linkIdentity, resolveRoles, resolveUser };
