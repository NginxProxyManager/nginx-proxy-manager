const { defineConfig } = require('cypress');

module.exports = defineConfig({
	requestTimeout:        30000,
	defaultCommandTimeout: 20000,
	reporter:              'cypress-multi-reporters',
	reporterOptions:       {
		configFile: 'multi-reporter.json'
	},
	video:             true,
	videosFolder:      'results/videos',
	screenshotsFolder: 'results/screenshots',
	e2e:               {
		setupNodeEvents(on, config) {
			on('before:browser:launch', (browser, launchOptions) => {
				if (browser.family === 'chromium' && process.env.SSO_HOST_RESOLVER_RULES) {
					launchOptions.args.push(`--host-resolver-rules=${process.env.SSO_HOST_RESOLVER_RULES}`);
				}
				if (browser.family === 'chromium' && process.env.SSO_CERT_SPKI) {
					// Process-scoped trust for the exact disposable fixture certificates.
					launchOptions.args.push(`--ignore-certificate-errors-spki-list=${process.env.SSO_CERT_SPKI}`);
				}
				return launchOptions;
			});
			return require('../plugins/index.js')(on, config);
		},
		env: {
			swaggerBase: '{{baseUrl}}/api/schema',
			skipStackCheck: 'true',
		},
	}
});
