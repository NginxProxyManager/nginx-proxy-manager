import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import checker from "vite-plugin-checker";
import "vitest/config";
import { execFile } from "node:child_process";

const runLocaleScripts = () => {
	execFile("yarn", ["locale-compile"], (error, stdout, _stderr) => {
		if (error) {
			throw error;
		}
		console.log(stdout);
		execFile("yarn", ["locale-sort"], (error, stdout, _stderr) => {
			if (error) {
				throw error;
			}
			console.log(stdout);
		});
	});
};

// https://vitejs.dev/config/
export default defineConfig({
	plugins: [
		{
			name: 'run-on-start',
			configureServer(_server) {
				// Only run during dev server, not during vitest (avoids race condition
				// where locale-compile writes lang/*.json while Vite is importing them)
				if (!process.env.VITEST) {
					runLocaleScripts();
				}
			},
		},
		{
			name: "trigger-on-reload",
			configureServer(server) {
				server.watcher.on("change", (file) => {
					if (file.includes("locale/src")) {
						console.log(`File changed: ${file}, running locale scripts...`);
						runLocaleScripts();
					}
				});
			},
		},
		react(),
		checker({
			// e.g. use TypeScript check
			typescript: true,
		}),
	],
	resolve: {
		tsconfigPaths: true,
	},
	server: {
		host: true,
		port: 5173,
		strictPort: true,
		allowedHosts: true,
	},
	test: {
		environment: "happy-dom",
		setupFiles: ["./vitest-setup.js"],
	},
	assetsInclude: ["**/*.md", "**/*.png", "**/*.svg"],
});
