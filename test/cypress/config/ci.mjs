import { defineConfig } from 'cypress';
import pluginSetup from '../plugins/index.mjs';

const adminPort = process.env.NPM_ADMIN_PORT ?? 81;

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
		},
		baseUrl: `http://fullstack:${adminPort}`,
	}
});
