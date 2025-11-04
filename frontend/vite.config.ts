import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import checker from "vite-plugin-checker";
import tsconfigPaths from "vite-tsconfig-paths";
import "vitest/config";
import { execFile } from "node:child_process";

// https://vitejs.dev/config/
export default defineConfig({
	plugins: [
		{
			name: "trigger-script-on-reload",
			configureServer(server) {
				server.watcher.on("change", (file) => {
					if (file.includes("locale/src")) {
						console.log(`File changed: ${file}, running locale-compile script...`);
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
					}
				});
			},
		},
		react(),
		checker({
			// e.g. use TypeScript check
			typescript: true,
		}),
		tsconfigPaths(),
	],
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
