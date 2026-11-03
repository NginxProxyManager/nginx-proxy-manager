import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		environment: "node",
		include: ["__tests__/**/*.test.js"],
		// Auth code is the wrong place for a flaky test to hide
		restoreMocks: true,
	},
});
