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
import {
	DEFAULT_ADMIN_EMAIL,
	DEFAULT_ADMIN_PASSWORD,
	TEST_USER_EMAIL,
	TEST_USER_NAME,
	TEST_USER_NICKNAME, TEST_USER_PASSWORD
} from "./constants";

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

/**
 * Configure OIDC settings in the backend, so we can test scenarios around OIDC being enabled or disabled.
 */
Cypress.Commands.add('configureOidc', (enabled) => {
	cy.getToken().then((token) => {
		if (enabled) {
			cy.task('backendApiPut', {
				token: token,
				path: '/api/settings/oidc-config',
				data: {
					meta: {
						name: 'ACME OIDC Provider',
						clientID: 'clientID',
						clientSecret: 'clientSecret',
						// TODO: Create dummy OIDC provider for testing
						issuerURL: 'https://oidc.example.com',
						redirectURL: 'https://redirect.example.com/api/oidc/callback',
						enabled: true,
					}
				},
			})
		} else {
			cy.task('backendApiPut', {
				token: token,
				path: '/api/settings/oidc-config',
				data: {
					meta: {
						name: '',
						clientID: '',
						clientSecret: '',
						issuerURL: '',
						redirectURL: '',
						enabled: false,
					}
				},
			})
		}
	});
});

/**
 * Create a new user in the backend for testing purposes.
 *
 * The created user will have a name, nickname, email, and password as defined in the constants file (TEST_USER_*).
 *
 * @param {boolean} withPassword Whether to create the user with a password or not (default: true)
 */
Cypress.Commands.add('createTestUser', (withPassword) => {
	if (withPassword === undefined) {
		withPassword = true;
	}

	cy.getToken().then((token) => {
		cy.task('backendApiPost', {
			token: token,
			path: '/api/users',
			data: {
				name: TEST_USER_NAME,
				nickname: TEST_USER_NICKNAME,
				email: TEST_USER_EMAIL,
				roles: ['admin'],
				is_disabled: false,
				auth: withPassword ? {
					type: 'password',
					secret: TEST_USER_PASSWORD
				} : {}
			}
		})
	});
});


/**
 * Delete the test user from the backend.
 * The test user is identified by the email address defined in the constants file (TEST_USER_EMAIL).
 *
 * This command will only attempt to delete the test user if it exists.
 */
Cypress.Commands.add('deleteTestUser', () => {
	cy.getToken().then((token) => {
		cy.task('backendApiGet', {
			token: token,
			path: '/api/users',
		}).then((data) => {
			// Find the test user
			const testUser = data.find(user => user.email === TEST_USER_EMAIL);

			// If the test user doesn't exist, we don't need to delete it
			if (!testUser) {
				return;
			}

			// Delete the test user
			cy.task('backendApiDelete', {
				token: token,
				path: `/api/users/${testUser.id}`,
			});
		});
	});
});

/**
 * Get a new token from the backend.
 * The token will be created using the default admin email and password defined in the constants file (DEFAULT_ADMIN_*).
 */
Cypress.Commands.add('getToken', () => {
	// login with existing user
	cy.task('backendApiPost', {
		path: '/api/tokens',
		data: {
			identity: DEFAULT_ADMIN_EMAIL,
			secret: DEFAULT_ADMIN_PASSWORD
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
