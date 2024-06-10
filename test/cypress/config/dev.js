const { defineConfig } = require('cypress');

module.exports = defineConfig({
	requestTimeout: 30000,
	defaultCommandTimeout: 20000,
	reporter: 'cypress-multi-reporters',
	reporterOptions: {
		configFile: 'multi-reporter.json'
	},
	video: false,
	videosFolder: 'results/videos',
	screenshotsFolder: 'results/screenshots',
	e2e: {
		setupNodeEvents(on, config) {
			return require("../plugins/index.js")(on, config);
		},
		env: {
			swaggerBase: '{{baseUrl}}/api/schema',
		},
		baseUrl: 'http://localhost:1234',
	}
});
