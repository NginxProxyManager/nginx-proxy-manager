#!/usr/bin/node

import SwaggerParser from "@apidevtools/swagger-parser";
import chalk from "chalk";
import { getCompiledSchema } from "./schema/index.js";

const log = console.log;

getCompiledSchema().then(async (swaggerJSON) => {
	try {
		const api = await SwaggerParser.validate(swaggerJSON);
		console.log("API name: %s, Version: %s", api.info.title, api.info.version);
		log(chalk.green("❯ Schema is valid"));
	} catch (e) {
		console.error(e);
		log(chalk.red("❯", e.message), "\n");
		process.exit(1);
	}
});
