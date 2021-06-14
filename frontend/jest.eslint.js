module.exports = {
	displayName: "ESLint",
	runner: "jest-runner-eslint",
	testMatch: ["<rootDir>/src/**/*.(js|jsx|ts|tsx)"],
	watchPlugins: ["jest-runner-eslint/watch-fix"],
};
