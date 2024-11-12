const { defineConfig } = require('cypress');

module.exports = defineConfig({
	requestTimeout:        30000,
	defaultCommandTimeout: 20000,
	reporter:              'cypress-multi-reporters',
	reporterOptions:       {
		configFile: 'multi-reporter.json'
	},
	video:             false,
	screenshotsFolder: 'results/screenshots',
	e2e:               {
		setupNodeEvents(on, config) {
			return require('../plugins/index.js')(on, config);
		},
		env: {
			swaggerBase: '{{baseUrl}}/api/schema',
			authentik: 'http://authentik:9000',
			authentikLdap: 'authentik-ldap:3389',
			oauthRedirect: 'http://npm:81',
		},
	}
});
