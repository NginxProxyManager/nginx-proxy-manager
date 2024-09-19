/// <reference types="Cypress" />

describe('Basic API checks', () => {
	it('Should return a valid health payload', function () {
		cy.task('backendApiGet', {
			path: '/api/',
		}).then((data) => {
			// Check the swagger schema:
			cy.validateSwaggerSchema('get', 200, '/', data);
		});
	});

	it('Should return a valid schema payload', function () {
		cy.task('backendApiGet', {
			path: '/api/schema',
		}).then((data) => {
			expect(data.openapi).to.be.equal('3.0.0');
		});
	});
});
