/// <reference types="cypress" />

describe('Swagger Schema Linting', () => {
	it('Should be a completely valid schema', () => {
		cy.validateSwaggerFile('/api/schema', 'results/swagger-schema.json');
	});
});
