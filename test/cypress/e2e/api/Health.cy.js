/// <reference types="cypress" />

describe('Basic API checks', () => {
	it('Should return a valid health payload', function() {
		cy.task('backendApiGet', {
			path: '/api/',
		}).then((data) => {
			expect(data.result.healthy, 'healthy should equal true').to.equal(true);
			cy.validateSwaggerSchema('get', 200, '/', data);
		});
	});
});
