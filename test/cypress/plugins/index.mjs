import { SwaggerValidation } from "@jc21/cypress-swagger-validation";
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

	return config;
};
