/// <reference types="cypress" />

describe('Swagger Schema Linting', () => {
	it('Should be a completely valid schema', () => {
		cy.validateSwaggerFile('/api/schema', 'results/swagger-schema.json');
	});
	it('Should preserve required nullable PAT timestamps in OpenAPI 3.1', () => {
		cy.task('backendApiGet', {
			path: '/api/schema',
		}).then((data) => {
			// Keep the compatible noun-based path; exempt only its HTTP-verb style false positive.
			const options = data.paths['/api-tokens/options'];
			expect(options['x-lint-ignore']).to.equal('no-http-verbs-in-path');
			expect(options.description).to.include('settings noun');
			expect(options.get.operationId).to.equal('getApiTokenOptions');
			const responses = data.paths['/api-tokens'];
			const schemas = [
				responses.get.responses['200'].content['application/json'].schema.items,
				responses.post.responses['201'].content['application/json'].schema,
			];
			for (const schema of schemas) {
				for (const field of ['revoked_on', 'last_used_on']) {
					expect(schema.required).to.include(field);
					expect(schema.properties[field].type).to.deep.equal(['string', 'null']);
					expect(schema.properties[field].format).to.equal('date-time');
					expect(schema.properties[field]).not.to.have.property('nullable');
				}
			}
		});
	});
});
