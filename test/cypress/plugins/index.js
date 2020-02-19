const {SwaggerValidation} = require('@jc21/cypress-swagger-validation');

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
			console.log(message);
			return null;
		}
	});

	return config;
};
