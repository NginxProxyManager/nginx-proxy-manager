/**
 * Jest configuration for the NPM Proxy Manager backend.
 *
 * Uses Node's native ESM via --experimental-vm-modules.
 * Maps missing runtime deps (not installed in the lean test env) to stubs.
 *
 * Run with:
 *   NODE_OPTIONS="--experimental-vm-modules" npx jest --no-coverage
 */
export default {
	testEnvironment: "node",

	// Custom resolver: normalise symlinked workspace paths (e.g. /home/clawd/…)
	// through realpathSync so they match the NFS real paths (/mnt/nfs/…) that
	// Jest uses when following transitive imports. Without this, jest.mock()
	// factories registered from the symlink path don't apply to modules loaded
	// via the real path, causing all mock assertions to see "0 calls".
	resolver: "<rootDir>/jest.resolver.cjs",

	// Map runtime deps that are absent/broken in the test environment
	// to lightweight stubs so the module graph can be built without errors.
	// Actual test-subject modules are mocked with jest.mock() in each test file.
	moduleNameMapper: {
		// signale: structured logger — not installed in test env
		"^signale$":   "<rootDir>/__mocks__/signale.js",
		// objection: Knex-based ORM — models are mocked in test files
		"^objection$": "<rootDir>/__mocks__/objection.js",
		// node-rsa: depends on native 'asn1' addon not available in test env
		"^node-rsa$":  "<rootDir>/__mocks__/node-rsa.js",
		// bcrypt: native addon via node-gyp-build not available in test env
		"^bcrypt$":    "<rootDir>/__mocks__/bcrypt.js",
		// lodash: CJS — needs ESM shim so Jest can import it correctly
		"^lodash$":    "<rootDir>/__mocks__/lodash.js",
		// moment: CJS date library not installed in test env
		"^moment$":    "<rootDir>/__mocks__/moment.js",
		// tarn: connection pool library, transitive dep of knex — not installed
		"^tarn$":      "<rootDir>/__mocks__/tarn.js",
		// lib/config.js: has a circular dep with logger.js that breaks ESM linking;
		// stub it so the circular is broken and named exports are always available.
		"^(\\.{1,2}/)+lib/config\\.js$": "<rootDir>/__mocks__/config.js",
		// db.js: Knex connection factory — stub to avoid DB connection attempts
		"^(\\.{1,2}/)+db\\.js$":        "<rootDir>/__mocks__/db.js",
	},

	// Only run our own tests, not third-party node_module tests
	testPathIgnorePatterns: [
		"/node_modules/",
	],

	// Explicitly limit test discovery to our test directory
	testMatch: [
		"**/__tests__/**/*.test.js",
	],
};
