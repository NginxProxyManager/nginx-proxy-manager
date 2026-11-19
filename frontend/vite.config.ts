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
				runLocaleScripts();
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
		// Node 25+ has a built-in global localStorage (undefined without
		// --localstorage-file) that shadows happy-dom's; turn it off.
		execArgv: ["--no-experimental-webstorage"],
	},
	assetsInclude: ["**/*.md", "**/*.png", "**/*.svg"],
});
