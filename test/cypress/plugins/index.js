const { SwaggerValidation } = require('@jc21/cypress-swagger-validation');
const chalk = require('chalk');

module.exports = (on, config) => {
	// Replace swaggerBase config var wildcard
	if (typeof config.env.swaggerBase !== 'undefined') {
		config.env.swaggerBase = config.env.swaggerBase.replace('{{baseUrl}}', config.baseUrl);
	}

	// Plugin Events
	on('task', SwaggerValidation(config));
	on('task', require('./backendApi/task')(config));
	on('task', {
		log(message) {
			console.log(`${chalk.cyan.bold('[')}${chalk.blue.bold('LOG')}${chalk.cyan.bold(']')} ${chalk.red.bold(message)}`);
			return null;
		}
	});

	return config;
};
