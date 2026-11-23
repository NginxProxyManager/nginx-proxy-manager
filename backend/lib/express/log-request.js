import chalk from "chalk";
import { debug, express as logger } from "../../logger.js";

export default (req, _res, next) => {
	debug(logger, `[${chalk.yellow(req.method.toUpperCase())}] ${chalk.green(req.path)}`);
	next();
};
