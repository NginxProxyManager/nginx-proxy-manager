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
	let result = '';
	const characters = 'ABCDEFGHIJK LMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	const charactersLength = characters.length;
	for (let i = 0; i < length; i++) {
		result += characters.charAt(Math.floor(Math.random() * charactersLength));
	}
	return result;
});

/**
 * Check the swagger schema file:
 *
 * @param {string}  url
 * @param {string}  savePath
 */
Cypress.Commands.add("validateSwaggerFile", (url, savePath) => {
	cy.task('log', `validateSwaggerFile: ${url} -- ${savePath}`)
		.then(() => {
			return cy
				.request(url)
				.then((response) => cy.writeFile(savePath, response.body, { log: false }))
				.then(() => cy.exec(`yarn swagger-lint '${savePath}'`, { failOnNonZeroExit: false }))
				.then((result) => cy.task('log', `Swagger Vacuum Results:\n${result.stdout || ''}`)
					.then(() => expect(result.exitCode).to.eq(0)));
		});
});

/**
 * Check the swagger schema for a specific endpoint:
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

Cypress.Commands.add('createInitialUser', (defaultUser) => {
	let user = {
		name:        'Cypress McGee',
		nickname:    'Cypress',
		email:       'cypress@example.com',
		auth:        {
			type:   'password',
			secret: 'changeme'
		},
	};

	if (typeof defaultUser === 'object' && defaultUser) {
		user = Object.assign({}, user, defaultUser);
	}

	return cy.task('backendApiPost', {
		path: '/api/users',
		data: user,
	}).then((data) => {
		// Check the swagger schema:
		cy.validateSwaggerSchema('post', 201, '/users', data);
		expect(data).to.have.property('id');
		expect(data.id).to.be.greaterThan(0);
		cy.wrap(data);
	});
});

Cypress.Commands.add('getToken', (defaultUser, defaultAuth) => {
	if (typeof defaultAuth === 'object' && defaultAuth) {
		if (!defaultUser) {
			defaultUser = {};
		}
		defaultUser.auth = defaultAuth;
	}

	cy.task('backendApiGet', {
		path: '/api/',
	}).then((data) => {
		// Check the swagger schema:
		cy.validateSwaggerSchema('get', 200, '/', data);

		if (!data.setup) {
			cy.log('Setup = false');
			// create a new user
			cy.createInitialUser(defaultUser).then(() => {
				return cy.getToken(defaultUser);
			});
		} else {
			let auth = {
				identity: 'cypress@example.com',
				secret:   'changeme',
			};

			if (typeof defaultUser === 'object' && defaultUser && typeof defaultUser.auth === 'object' && defaultUser.auth) {
				auth = Object.assign({}, auth, defaultUser.auth);
			}

			cy.log('Setup = true');
			// login with existing user
			cy.task('backendApiPost', {
				path: '/api/tokens',
				data: auth,
			}).then((res) => {
				cy.wrap(res.token);
			});
		}
	});
});

Cypress.Commands.add('resetUsers', () => {
	cy.task('backendApiDelete', {
		path: '/api/users'
	}).then((data) => {
		expect(data).to.be.equal(true);
		cy.wrap(data);
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
