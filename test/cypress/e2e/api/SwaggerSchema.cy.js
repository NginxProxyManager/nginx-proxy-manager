/// <reference types="cypress" />

const SWAGGER_SCHEMA_FILENAME = 'results/swagger-schema.json';

describe('Swagger Schema Linting', () => {
	it('Should be a completely valid schema', () => {
		// Save the schema to a file and lint it
		cy.request('/api/schema')
			.then((response) => {
				const fileContent = response.body;
				cy.writeFile(SWAGGER_SCHEMA_FILENAME, fileContent);
			})
			.then(() => {
				cy.exec(`yarn swagger-lint '${SWAGGER_SCHEMA_FILENAME}'`)
				.then((result) => {
					cy.log("Swagger Vacuum Results:\n", result.stdout);
					expect(result.code).to.eq(0);
				});
			});
	});
});
