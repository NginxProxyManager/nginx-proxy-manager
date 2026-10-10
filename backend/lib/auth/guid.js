/**
 * Stable directory identifiers.
 *
 * A distinguished name is not a durable key: renaming someone, or moving them
 * between organisational units, changes it. Directories therefore publish an
 * immutable identifier alongside it, and that is what a local account should be
 * tied to:
 *
 *   - Active Directory      `objectGUID`, 16 raw bytes in a mixed-endian layout
 *   - OpenLDAP / 389-ds     `entryUUID`, already an RFC 4122 string
 *
 * Both are normalised here to the same lowercase hyphenated form.
 */

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * Converts an Active Directory objectGUID to its canonical string form.
 *
 * The first three groups are stored little-endian and the last two big-endian,
 * which is why they cannot simply be hex encoded in order.
 *
 * @param   {Buffer|String} raw
 * @returns {String} lowercase hyphenated GUID
 */
const parseObjectGuid = (raw) => {
	const buf = Buffer.isBuffer(raw) ? raw : Buffer.from(String(raw), "binary");

	if (buf.length !== 16) {
		throw new Error(`objectGUID must be exactly 16 bytes, got ${buf.length}`);
	}

	const hex = (...bytes) => Buffer.from(bytes).toString("hex");

	return [
		hex(buf[3], buf[2], buf[1], buf[0]),
		hex(buf[5], buf[4]),
		hex(buf[7], buf[6]),
		hex(buf[8], buf[9]),
		hex(buf[10], buf[11], buf[12], buf[13], buf[14], buf[15]),
	].join("-");
};

/**
 * Turns a canonical GUID back into the byte-escaped form an Active Directory
 * search filter needs, e.g. `\d3\d1\9a\5c...`.
 *
 * @param   {String} guid
 * @returns {String}
 */
const guidToLdapFilter = (guid) => {
	const hex = String(guid).replace(/-/g, "").toLowerCase();

	if (!/^[0-9a-f]{32}$/.test(hex)) {
		throw new Error(`Invalid GUID: "${guid}"`);
	}

	const at = (i) => hex.slice(i * 2, i * 2 + 2);

	// Undo the endian swap performed when the GUID was parsed
	const order = [3, 2, 1, 0, 5, 4, 7, 6, 8, 9, 10, 11, 12, 13, 14, 15];
	return order.map((i) => `\\${at(i)}`).join("");
};

/**
 * @param   {String} value
 * @returns {String|null}
 */
const normalizeEntryUuid = (value) => {
	const normalized = String(value).trim().toLowerCase();
	return UUID_PATTERN.test(normalized) ? normalized : null;
};

/**
 * Reads whichever stable identifier a search entry happens to carry.
 *
 * Returns null when the directory publishes neither, in which case the caller
 * has to fall back to matching on the distinguished name.
 *
 * @param   {Object} entry  an ldapts search entry
 * @returns {Object|null}   { guid, source } or null
 */
const extractDirectoryGuid = (entry) => {
	if (!entry) {
		return null;
	}

	const objectGuid = entry.objectGUID ?? entry.objectguid;
	if (objectGuid) {
		const raw = Array.isArray(objectGuid) ? objectGuid[0] : objectGuid;
		try {
			return { guid: parseObjectGuid(raw), source: "objectGUID" };
		} catch (_) {
			// Fall through to entryUUID rather than failing the whole login
		}
	}

	const entryUuid = entry.entryUUID ?? entry.entryuuid;
	if (entryUuid) {
		const raw = Array.isArray(entryUuid) ? entryUuid[0] : entryUuid;
		const normalized = normalizeEntryUuid(Buffer.isBuffer(raw) ? raw.toString("utf8") : raw);
		if (normalized) {
			return { guid: normalized, source: "entryUUID" };
		}
	}

	return null;
};

export { extractDirectoryGuid, guidToLdapFilter, normalizeEntryUuid, parseObjectGuid, UUID_PATTERN };
