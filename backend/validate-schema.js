const SwaggerParser = require('@apidevtools/swagger-parser');
const schema = require('./schema');
const log = console.log;

schema.getCompiledSchema().then(async (swaggerJSON) => {
	try {
		const api = await SwaggerParser.validate(swaggerJSON);
		console.log('API name: %s, Version: %s', api.info.title, api.info.version);
		log('❯ Schema is valid');
	} catch (e) {
		console.error(e);
		log('❯', e.message, '\n');
		process.exit(1);
	}
});
