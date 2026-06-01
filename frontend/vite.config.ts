import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import checker from "vite-plugin-checker";
import "vitest/config";
import { execFileSync } from "node:child_process";

const runLocaleScripts = () => {
	// execFileSync (blocking) instead of execFile (async). This matters when
	// the hook fires during vitest startup: an async compile races with
	// vitest's JSON imports of the same files, producing "EOF while parsing"
	// on slow CI filesystems. Running synchronously means imports happen
	// after the lang/*.json files are fully rewritten.
	try {
		execFileSync("yarn", ["locale-compile"], { stdio: "inherit" });
		execFileSync("yarn", ["locale-sort"], { stdio: "inherit" });
	} catch (err) {
		throw err;
	}
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
	},
	assetsInclude: ["**/*.md", "**/*.png", "**/*.svg"],
});
