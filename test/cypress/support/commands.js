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
	cy.task('backendApiGet', {
		path: '/api/',
	}).then((data) => {
		// Check the swagger schema:
		cy.task('validateSwaggerSchema', {
			endpoint:       '/',
			method:         'get',
			statusCode:     200,
			responseSchema: data,
			verbose:        true,
		}).should('equal', null);

		if (!data.result.setup) {
			cy.log('Setup = false');
			// create a new user
			cy.createInitialUser().then(() => {
				return cy.getToken();
			});
		} else {
			cy.log('Setup = true');
			// login with existing user
			cy.task('backendApiPost', {
				path: '/api/tokens',
				data: {
					type:     'password',
					identity: 'jc@jc21.com',
					secret:   'changeme'
				}
			}).then(res => {
				cy.wrap(res.result.token);
			});
		}
	});
});

Cypress.Commands.add('createInitialUser', () => {
	return cy.task('backendApiPost', {
		path: '/api/users',
		data: {
			name:        'Jamie Curnow',
			nickname:    'James',
			email:       'jc@jc21.com',
			roles:       [],
			is_disabled: false,
			auth:        {
				type:   'password',
				secret: 'changeme'
			}
		}
	}).then((data) => {
		// Check the swagger schema:
		cy.task('validateSwaggerSchema', {
			endpoint:       '/users',
			method:         'post',
			statusCode:     201,
			responseSchema: data,
			verbose:        true
		}).should('equal', null);

		expect(data.result).to.have.property('id');
		expect(data.result.id).to.be.greaterThan(0);
		cy.wrap(data.result);
	});
});
