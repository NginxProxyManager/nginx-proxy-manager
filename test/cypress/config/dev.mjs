import { defineConfig } from 'cypress';
import pluginSetup from '../plugins/index.mjs';

export default defineConfig({
	allowCypressEnv: false,
	requestTimeout: 30000,
	defaultCommandTimeout: 20000,
	reporter: "cypress-multi-reporters",
	reporterOptions: {
		configFile: "multi-reporter.json"
	},
	video: true,
	videosFolder: "results/videos",
	screenshotsFolder: "results/screenshots",
	e2e: {
		setupNodeEvents(on, config) {
			return pluginSetup(on, config);
		},
		env: {
			swaggerBase: `{{baseUrl}}/api/schema?ts=${Date.now()}`,
			// Set to 1 with docker compose --profile vault for VaultIntegration.cy.js
			VAULT_INTEGRATION: 0,
		},
		baseUrl: "http://127.0.0.1:3081",
	}
});
