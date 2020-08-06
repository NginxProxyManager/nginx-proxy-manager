// ***********************************************
// This example commands.js shows you how to
// create various custom commands and overwrite
// existing commands.
//
// For more comprehensive examples of custom
// commands please read more here:
// https://on.cypress.io/custom-commands
// ***********************************************
//

/**
 * Check the swagger schema:
 *
 * @param {string}  method        API Method in swagger doc, "get", "put", "post", "delete"
 * @param {string}  path          Swagger doc endpoint path, exactly as defined in swagger doc
 * @param {*}       data          The API response data to check against the swagger schema
 */
Cypress.Commands.add('validateSwaggerSchema', (method, path, data) => {
	cy.task('validateSwaggerSchema', {
		file:           Cypress.env('swaggerBase'),
		endpoint:       path,
		method:         method,
		statusCode:     200,
		responseSchema: data,
		verbose:        true
	}).should('equal', null);
});

Cypress.Commands.add('getToken', () => {
	// login with existing user
	cy.task('backendApiPost', {
		path: '/api/tokens',
		data: {
			identity: "admin@example.com",
			secret: "changeme"
		}
	}).then(res => {
		cy.wrap(res.result.token);
	});
});
