import { plugin as cypressGrepPlugin } from "@cypress/grep/plugin";
import { SwaggerValidation } from "@jc21/cypress-swagger-validation";
import { exec } from "node:child_process";
import chalk from "chalk";
import backendTask from "./backendApi/task.mjs";

export default (on, config) => {
	// Replace swaggerBase config var wildcard
	if (typeof config.env.swaggerBase !== "undefined") {
		config.env.swaggerBase = config.env.swaggerBase.replace(
			"{{baseUrl}}",
			config.baseUrl,
		);
	}

	cypressGrepPlugin(config);

	// Plugin Events
	on("task", SwaggerValidation(config));
	on("task", backendTask(config));
	on("task", {
		log(message) {
			console.log(
				`${chalk.cyan.bold("[")}${chalk.blue.bold("LOG")}${chalk.cyan.bold("]")} ${chalk.red.bold(message)}`,
			);
			return null;
		},
	});
	on("task", {
		/**
		 * Replacement for cy.exec(), removed in Cypress 16
		 *
		 * @param   {object}    options
		 * @param   {string}    options.command
		 * @param   {bool}      [options.failOnNonZeroExit] Defaults to true
		 * @returns {object}    { exitCode, stdout, stderr }
		 */
		exec({ command, failOnNonZeroExit = true }) {
			return new Promise((resolve, reject) => {
				exec(command, { maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
					const result = {
						exitCode: error ? (error.code ?? 1) : 0,
						stdout: stdout.trimEnd(),
						stderr: stderr.trimEnd(),
					};
					if (error && failOnNonZeroExit) {
						reject(new Error(`Command failed with exit code ${result.exitCode}: ${command}\n${result.stderr}`));
						return;
					}
					resolve(result);
				});
			});
		},
	});
	on("task", {
		getFixturesFolder() {
			return config.fixturesFolder;
		},
	});

	return config;
};
