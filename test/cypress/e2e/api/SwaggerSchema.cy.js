/// <reference types="cypress" />

describe('Swagger Schema Checks', () => {
	it('Should be valid with swagger-validator', function() {
		cy.task('validateSwaggerFile', {
			file: Cypress.env('swaggerBase')
		}).should('equal', null);
	});
});
