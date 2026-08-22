import { Client } from "ldapts";
import { auth as logger } from "../../logger.js";
import errs from "../error.js";
import { extractDirectoryGuid } from "./guid.js";

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
 * Attributes that must come back as raw bytes. objectGUID is binary and would
 * be mangled if ldapts decoded it as UTF-8.
 */
const BINARY_ATTRIBUTES = ["objectGUID", "objectSid"];

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

/**
 * Turns a driver error into something an administrator can act on.
 *
 * ldapts reports protocol failures as a bare result code, so "Code: 0x31" is
 * all you get for a wrong bind password unless it is translated.
 *
 * @see https://datatracker.ietf.org/doc/html/rfc4511#appendix-A
 * @param   {Error} err
 * @returns {String}
 */
const describeLdapError = (err) => {
	if (!err) {
		return "Unknown LDAP error";
	}

	// Connection level problems never reach a result code
	switch (err.code) {
		case "ECONNREFUSED":
			return "Connection refused — check the server URL and port";
		case "ENOTFOUND":
		case "EAI_AGAIN":
			return "Server not found — check the host name";
		case "ETIMEDOUT":
			return "Connection timed out — check the server URL, port and any firewall";
		case "DEPTH_ZERO_SELF_SIGNED_CERT":
		case "SELF_SIGNED_CERT_IN_CHAIN":
		case "UNABLE_TO_VERIFY_LEAF_SIGNATURE":
			return "The server's TLS certificate could not be verified. Use a trusted certificate, or turn off certificate verification if you trust this server.";
		default:
			break;
	}

	// ldapts exposes the protocol result as a numeric code
	const RESULTS = {
		1: "The server reported an internal error",
		7: "Authentication method not supported by the server",
		8: "The server requires a stronger connection — try LDAPS or StartTLS",
		32: "No such object — check the base DN",
		34: "Malformed DN",
		48: "The server refused to authenticate — inappropriate authentication",
		49: "Invalid credentials — check the bind DN and password",
		50: "The bind account does not have permission for this operation",
		51: "The server is busy — try again shortly",
		52: "The server is unavailable",
		53: "The server was unwilling to perform this operation",
	};

	if (typeof err.code === "number" && RESULTS[err.code]) {
		return RESULTS[err.code];
	}

	const message = String(err.message || "").trim();
	return message || `LDAP error (code ${err.code})`;
};

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
 * Opens a connection bound as the service account (or anonymously).
 *
 * @param   {Object} meta
 * @returns {Promise<Client>}
 */
const connect = async (meta) => {
	const client = createClient(meta);
	try {
		if (meta.start_tls) {
			await client.startTLS({ rejectUnauthorized: meta.tls_reject_unauthorized !== false });
		}
		if (meta.bind_dn) {
			await client.bind(meta.bind_dn, meta.bind_password || "");
		}
	} catch (err) {
		await client.unbind().catch(() => {});
		throw new errs.AuthError(describeLdapError(err));
	}
	return client;
};

/**
 * The attributes every lookup needs. objectGUID and entryUUID are the stable
 * identifiers a local account is tied to; the rest populate the user record.
 *
 * @param   {Object} meta
 * @returns {[String]}
 */
const wantedAttributes = (meta) =>
	[
		"dn",
		"objectGUID",
		"entryUUID",
		meta.email_attribute || "mail",
		meta.name_attribute || "cn",
		meta.nickname_attribute,
		meta.group_attribute,
	].filter(Boolean);

/**
 * Builds the filter that locates the person signing in.
 *
 * A hand written `user_filter` always wins. Otherwise `login_attributes` is
 * turned into an OR across those attributes, which covers the common case of
 * "let them type their username, their email, or their sAMAccountName".
 *
 * @param   {Object} meta
 * @param   {String} username
 * @returns {String}
 */
const buildUserFilter = (meta, username) => {
	const escaped = escapeFilterValue(username);

	if (meta.user_filter) {
		return meta.user_filter.replace(/\{\{username\}\}/g, escaped);
	}

	const attributes = String(meta.login_attributes || "")
		.split(",")
		.map((a) => a.trim())
		.filter(Boolean);

	if (!attributes.length) {
		return `(uid=${escaped})`;
	}
	if (attributes.length === 1) {
		return `(${attributes[0]}=${escaped})`;
	}
	return `(|${attributes.map((a) => `(${a}=${escaped})`).join("")})`;
};

/**
 * Runs a search, transparently paging when the directory caps result sizes.
 *
 * @param   {Client} client
 * @param   {String} base
 * @param   {Object} options
 * @param   {Number} [pageSize]
 * @returns {Promise<[Object]>}
 */
const search = async (client, base, options, pageSize) => {
	const searchOptions = {
		scope: "sub",
		explicitBufferAttributes: BINARY_ATTRIBUTES,
		...options,
	};

	// Paging is pointless when we only ever want one or two entries, and some
	// servers reject the control alongside a small size limit.
	if (pageSize && pageSize > 0 && !searchOptions.sizeLimit) {
		searchOptions.paged = { pageSize };
	}

	const { searchEntries } = await client.search(base, searchOptions);
	return searchEntries;
};

/**
 * Turns a directory entry into the identity shape the rest of auth works with.
 *
 * @param   {Client} client
 * @param   {Object} meta
 * @param   {Object} entry
 * @param   {String} [username]
 * @returns {Promise<Object>}
 */
const entryToIdentity = async (client, meta, entry, username) => {
	const dn = entry.dn;
	const email = firstAttributeValue(entry, meta.email_attribute || "mail");

	if (!email) {
		throw new errs.AuthError(
			`LDAP entry ${dn} has no "${meta.email_attribute || "mail"}" attribute, which is required`,
		);
	}

	const directory = extractDirectoryGuid(entry);

	return {
		// Prefer the directory's immutable id: a DN changes when somebody is
		// renamed or moved between organisational units.
		identifier: directory ? directory.guid : dn,
		identifier_source: directory ? directory.source : "dn",
		dn,
		email,
		name: firstAttributeValue(entry, meta.name_attribute) || email,
		nickname: firstAttributeValue(entry, meta.nickname_attribute) || null,
		groups: await resolveGroups(client, meta, entry, dn, username || email),
	};
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
		const entries = await search(
			client,
			meta.group_base_dn || meta.base_dn || "",
			{ filter, attributes: nameAttribute === "dn" ? ["dn"] : ["dn", nameAttribute] },
			meta.page_size,
		);

		return entries
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
 * bind as the located user's DN to verify the password. Binding as the user is
 * the only way to check a password without being able to read it.
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

	const client = await connect(meta);

	try {
		const entries = await search(client, meta.base_dn || "", {
			filter: buildUserFilter(meta, username),
			sizeLimit: 2,
			attributes: wantedAttributes(meta),
		});

		if (entries.length !== 1) {
			logger.debug(`LDAP search for "${username}" on provider ${provider.id} returned ${entries.length} entries`);
			return null;
		}

		const entry = entries[0];

		// Prove the password by binding as the user themselves. This uses a
		// separate connection so that `client` stays bound as the service
		// account, which is usually the only identity allowed to read groups.
		const userClient = createClient(meta);
		try {
			if (meta.start_tls) {
				await userClient.startTLS({ rejectUnauthorized: meta.tls_reject_unauthorized !== false });
			}
			await userClient.bind(entry.dn, password);
		} catch (_) {
			return null;
		} finally {
			await userClient.unbind().catch(() => {});
		}

		return await entryToIdentity(client, meta, entry, username);
	} finally {
		await client.unbind().catch(() => {
			// Nothing useful to do if the socket is already gone
		});
	}
};

/**
 * Streams every directory entry the provider's sync settings select.
 *
 * Entries are handed to the callback a page at a time so that a large
 * directory never has to be held in memory all at once.
 *
 * @param   {Object}   provider
 * @param   {Function} onIdentity  called with each identity
 * @returns {Promise<Object>} counts
 */
const listDirectory = async (provider, onIdentity) => {
	const meta = provider.meta || {};
	const client = await connect(meta);

	let seen = 0;
	let skipped = 0;

	try {
		let filter = meta.sync_filter || "(objectClass=person)";

		// Restrict to one group's members when asked to
		if (meta.sync_group) {
			filter = `(&${filter}(${meta.group_attribute || "memberOf"}=${escapeFilterValue(meta.sync_group)}))`;
		}

		const entries = await search(
			client,
			meta.base_dn || "",
			{ filter, attributes: wantedAttributes(meta) },
			meta.page_size || 500,
		);

		for (const entry of entries) {
			seen++;
			try {
				const identity = await entryToIdentity(client, meta, entry);
				await onIdentity(identity);
			} catch (err) {
				// One unusable entry (usually no email address) must not abort
				// the whole run
				skipped++;
				logger.debug(`Skipping LDAP entry ${entry.dn}: ${err.message}`);
			}
		}
	} finally {
		await client.unbind().catch(() => {});
	}

	return { seen, skipped };
};

/**
 * Verifies that a provider's settings can actually reach the directory.
 *
 * @param   {Object} provider
 * @returns {Promise<Object>}
 */
const test = async (provider) => {
	const meta = provider.meta || {};
	const client = await connect(meta);

	try {
		await search(client, meta.base_dn || "", {
			scope: "base",
			filter: "(objectClass=*)",
			sizeLimit: 1,
		});
		return { reachable: true };
	} catch (err) {
		throw new errs.AuthError(describeLdapError(err));
	} finally {
		await client.unbind().catch(() => {});
	}
};

/**
 * Runs a real credential check without issuing a token, so an administrator
 * can confirm a provider works before turning it on.
 *
 * @param   {Object} provider
 * @param   {String} username
 * @param   {String} password
 * @returns {Promise<Object>}
 */
const testAuthentication = async (provider, username, password) => {
	const identity = await authenticate(provider, username, password);

	if (!identity) {
		return { valid: false };
	}

	return {
		valid: true,
		dn: identity.dn,
		email: identity.email,
		name: identity.name,
		identifier_source: identity.identifier_source,
		groups: identity.groups,
	};
};

export { authenticate, buildUserFilter, describeLdapError, escapeFilterValue, listDirectory, test, testAuthentication };
