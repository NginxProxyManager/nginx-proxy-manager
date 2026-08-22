import { Client } from "ldapts";
import { auth as logger } from "../../logger.js";
import errs from "../error.js";

/**
 * Escapes a value for safe use inside an LDAP search filter.
 *
 * @see https://datatracker.ietf.org/doc/html/rfc4515#section-3
 * @param   {String} value
 * @returns {String}
 */
const escapeFilterValue = (value) =>
	String(value).replace(/[\\*()\0]/g, (char) => {
		switch (char) {
			case "\\":
				return "\\5c";
			case "*":
				return "\\2a";
			case "(":
				return "\\28";
			case ")":
				return "\\29";
			default:
				return "\\00";
		}
	});

/**
 * Reads an attribute off a search entry, always returning a flat array of
 * strings. ldapts hands back strings, arrays or Buffers depending on the value.
 *
 * @param   {Object} entry
 * @param   {String} attribute
 * @returns {[String]}
 */
const attributeValues = (entry, attribute) => {
	if (!attribute || typeof entry[attribute] === "undefined" || entry[attribute] === null) {
		return [];
	}
	const raw = Array.isArray(entry[attribute]) ? entry[attribute] : [entry[attribute]];
	return raw
		.map((value) => (Buffer.isBuffer(value) ? value.toString("utf8") : String(value)))
		.filter((v) => v !== "");
};

const firstAttributeValue = (entry, attribute) => attributeValues(entry, attribute)[0] || null;

const createClient = (meta) => {
	if (!meta.url) {
		throw new errs.ConfigurationError("LDAP provider has no server URL configured");
	}

	const options = {
		url: meta.url,
		timeout: meta.timeout || 10000,
		connectTimeout: meta.timeout || 10000,
	};

	// Supplying tlsOptions makes ldapts open a TLS socket, which a plain
	// ldap:// server will hang up on. Only set them when TLS is actually in play.
	if (/^ldaps:/i.test(meta.url) || meta.start_tls) {
		options.tlsOptions = {
			rejectUnauthorized: meta.tls_reject_unauthorized !== false,
		};
	}

	return new Client(options);
};

/**
 * Collects the groups a user belongs to.
 *
 * Directories with the memberOf overlay (and Active Directory) put the groups
 * straight on the user entry. Plain OpenLDAP instead stores membership on the
 * group, so when a group filter is configured we search the other way around.
 *
 * @param   {Client} client
 * @param   {Object} meta
 * @param   {Object} entry     the user's search entry
 * @param   {String} userDn
 * @param   {String} username
 * @returns {Promise<[String]>}
 */
const resolveGroups = async (client, meta, entry, userDn, username) => {
	const fromEntry = attributeValues(entry, meta.group_attribute);
	if (fromEntry.length || !meta.group_filter) {
		return fromEntry;
	}

	const filter = meta.group_filter
		.replace(/\{\{dn\}\}/g, escapeFilterValue(userDn))
		.replace(/\{\{username\}\}/g, escapeFilterValue(username));

	const nameAttribute = meta.group_name_attribute || "dn";

	try {
		const { searchEntries } = await client.search(meta.group_base_dn || meta.base_dn || "", {
			scope: "sub",
			filter,
		});

		return searchEntries
			.map((group) => (nameAttribute === "dn" ? group.dn : firstAttributeValue(group, nameAttribute)))
			.filter((name) => !!name);
	} catch (err) {
		// Group membership only affects role mapping, so a failure here should
		// not stop an otherwise valid login.
		logger.warn(`LDAP group search failed for ${userDn}: ${err.message}`);
		return [];
	}
};

/**
 * Authenticates a username/password pair against an LDAP directory.
 *
 * The directory is searched using the (optional) service account first, then we
 * re-bind as the located user's DN to verify the password. Binding as the user
 * is the only way to check a password without being able to read it.
 *
 * @param   {Object} provider
 * @param   {String} username  Whatever was typed into the login form
 * @param   {String} password
 * @returns {Promise<Object|null>} The external identity, or null if invalid
 */
const authenticate = async (provider, username, password) => {
	const meta = provider.meta || {};

	// An empty password would be an unauthenticated bind, which LDAP servers
	// happily accept and which would let anyone in as any user.
	if (!password) {
		return null;
	}

	const client = createClient(meta);

	try {
		if (meta.start_tls) {
			await client.startTLS({ rejectUnauthorized: meta.tls_reject_unauthorized !== false });
		}

		// Bind as the service account (or anonymously) to run the search
		if (meta.bind_dn) {
			await client.bind(meta.bind_dn, meta.bind_password || "");
		}

		const filter = (meta.user_filter || "(uid={{username}})").replace(
			/\{\{username\}\}/g,
			escapeFilterValue(username),
		);

		const { searchEntries } = await client.search(meta.base_dn || "", {
			scope: "sub",
			filter,
			sizeLimit: 2,
		});

		if (searchEntries.length !== 1) {
			logger.debug(
				`LDAP search for "${username}" on provider ${provider.id} returned ${searchEntries.length} entries`,
			);
			return null;
		}

		const entry = searchEntries[0];
		const userDn = entry.dn;

		// Prove the password by binding as the user themselves. This uses a
		// separate connection so that `client` stays bound as the service
		// account, which is usually the only identity allowed to read groups.
		const userClient = createClient(meta);
		try {
			if (meta.start_tls) {
				await userClient.startTLS({ rejectUnauthorized: meta.tls_reject_unauthorized !== false });
			}
			await userClient.bind(userDn, password);
		} catch (_) {
			return null;
		} finally {
			await userClient.unbind().catch(() => {});
		}

		const email = firstAttributeValue(entry, meta.email_attribute || "mail");
		if (!email) {
			throw new errs.AuthError(
				`LDAP entry ${userDn} has no "${meta.email_attribute || "mail"}" attribute, which is required`,
			);
		}

		return {
			identifier: userDn,
			email,
			name: firstAttributeValue(entry, meta.name_attribute) || email,
			nickname: firstAttributeValue(entry, meta.nickname_attribute) || null,
			groups: await resolveGroups(client, meta, entry, userDn, username),
		};
	} finally {
		await client.unbind().catch(() => {
			// Nothing useful to do if the socket is already gone
		});
	}
};

/**
 * Verifies that a provider's settings can actually reach the directory.
 *
 * @param   {Object} provider
 * @returns {Promise}
 */
const test = async (provider) => {
	const meta = provider.meta || {};
	const client = createClient(meta);

	try {
		if (meta.start_tls) {
			await client.startTLS({ rejectUnauthorized: meta.tls_reject_unauthorized !== false });
		}
		if (meta.bind_dn) {
			await client.bind(meta.bind_dn, meta.bind_password || "");
		}
		await client.search(meta.base_dn || "", { scope: "base", filter: "(objectClass=*)", sizeLimit: 1 });
	} finally {
		await client.unbind().catch(() => {});
	}
};

export { authenticate, test, escapeFilterValue };
