/**
 * Custom Jest resolver — normalises paths through fs.realpathSync so that
 * symlinked workspace paths and NFS real paths map to the same module entry.
 *
 * Without this, jest.mock("../../models/user.js") resolved from the symlink
 * path (/home/clawd/clawd/projects/…) would not match the same module when
 * ldap-sync.js (loaded via the NFS real path /mnt/nfs/…) imports it, causing
 * all jest.mock() factories to be ignored for transitively-loaded modules.
 */

const { realpathSync } = require("node:fs");
// path resolve not currently used — kept for reference
// const { resolve: pathResolve } = require("node:path");

module.exports = (request, options) => {
	const resolved = options.defaultResolver(request, options);
	try {
		return realpathSync(resolved);
	} catch {
		return resolved;
	}
};
