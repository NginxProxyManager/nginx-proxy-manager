import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import checker from "vite-plugin-checker";
import "vitest/config";
import { execFile } from "node:child_process";

const fileWatchPolling = process.env.FILE_WATCH_POLLING === "true";
const configuredWatchInterval = Number.parseInt(process.env.FILE_WATCH_INTERVAL ?? "500", 10);
const fileWatchInterval =
	Number.isSafeInteger(configuredWatchInterval) && configuredWatchInterval > 0 ? configuredWatchInterval : 500;
const fileWatchOptions = fileWatchPolling
	? {
			usePolling: true,
			interval: fileWatchInterval,
		}
	: undefined;

const packageManager = process.platform === "win32" ? "npm.cmd" : "npm";

const runLocaleScripts = () => {
	execFile(packageManager, ["run", "locale-compile"], (error, stdout, _stderr) => {
		if (error) {
			throw error;
		}
		console.log(stdout);
		execFile(packageManager, ["run", "locale-sort"], (error, stdout, _stderr) => {
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
			name: "run-on-start",
			configureServer(_server) {
				if (!process.env.VITEST) runLocaleScripts();
			},
		},
		{
			name: "trigger-on-reload",
			configureServer(server) {
				if (process.env.VITEST) return;
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
		// Poll only in containerized development when requested. Native events remain
		// the fast path for local Vite runs and Linux bind mounts.
		watch: fileWatchOptions,
	},
	test: {
		environment: "happy-dom",
		setupFiles: ["./vitest-setup.js"],
		coverage: {
			provider: "v8",
			reporter: ["text", "html"],
			include: ["src/**/*.{ts,tsx}"],
			exclude: ["src/generated/**", "src/locale/lang/**"],
			thresholds: {
				statements: 90,
				lines: 90,
			},
		},
	},
	assetsInclude: ["**/*.md", "**/*.png", "**/*.svg"],
});
