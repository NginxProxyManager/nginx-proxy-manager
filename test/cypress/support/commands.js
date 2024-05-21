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

import 'cypress-wait-until';

Cypress.Commands.add('randomString', (length) => {
	var result           = '';
	var characters       = 'ABCDEFGHIJK LMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	var charactersLength = characters.length;
	for (var i = 0; i < length; i++) {
		result += characters.charAt(Math.floor(Math.random() * charactersLength));
	}
	return result;
});

/**
 * Check the swagger schema:
 *
 * @param {string}  method        API Method in swagger doc, "get", "put", "post", "delete"
 * @param {integer} code          Swagger doc endpoint response code, exactly as defined in swagger doc
 * @param {string}  path          Swagger doc endpoint path, exactly as defined in swagger doc
 * @param {*}       data          The API response data to check against the swagger schema
 */
Cypress.Commands.add('validateSwaggerSchema', (method, code, path, data) => {
	cy.task('validateSwaggerSchema', {
		file:           Cypress.env('swaggerBase'),
		endpoint:       path,
		method:         method,
		statusCode:     code,
		responseSchema: data,
		verbose:        true
	}).should('equal', null);
});

Cypress.Commands.add('getToken', () => {
	// login with existing user
	cy.task('backendApiPost', {
		path: '/api/tokens',
		data: {
			identity: 'admin@example.com',
			secret:   'changeme'
		}
	}).then(res => {
		cy.wrap(res.token);
	});
});

// TODO: copied from v3, is this usable?
Cypress.Commands.add('waitForCertificateStatus', (token, certID, expected, timeout = 60) => {
	cy.log(`Waiting for certificate (${certID}) status (${expected}) timeout (${timeout})`);

	cy.waitUntil(() => cy.task('backendApiGet', {
		token: token,
		path:  `/api/certificates/${certID}`
	}).then((data) => {
		return data.result.status === expected;
	}), {
		errorMsg: 'Waiting for certificate status failed',
		timeout:  timeout * 1000,
		interval: 5000
	});
});
