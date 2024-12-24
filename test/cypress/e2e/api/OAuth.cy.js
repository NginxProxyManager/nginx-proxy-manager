/// <reference types="cypress" />

describe('OAuth with Authentik', () => {
	let token;
	if (Cypress.env('skipStackCheck') === 'true' || Cypress.env('stack') === 'postgres') {

		before(() => {
			cy.getToken().then((tok) => {
				token = tok;

				// cy.task('backendApiPut', {
				// 	token: token,
				// 	path:  '/api/settings/oauth-auth',
				// 	data:  {
				// 		value: {
				// 			client_id: '7iO2AvuUp9JxiSVkCcjiIbQn4mHmUMBj7yU8EjqU',
				// 			client_secret: 'VUMZzaGTrmXJ8PLksyqzyZ6lrtz04VvejFhPMBP9hGZNCMrn2LLBanySs4ta7XGrDr05xexPyZT1XThaf4ubg00WqvHRVvlu4Naa1aMootNmSRx3VAk6RSslUJmGyHzq',
				// 			authorization_url: 'http://authentik:9000/application/o/authorize/',
				// 			resource_url: 'http://authentik:9000/application/o/userinfo/',
				// 			token_url: 'http://authentik:9000/application/o/token/',
				// 			logout_url: 'http://authentik:9000/application/o/npm/end-session/',
				// 			identifier: 'preferred_username',
				// 			scopes: [],
				// 			auto_create_user: true
				// 		}
				// 	}
				// }).then((data) => {
				// 	cy.validateSwaggerSchema('put', 200, '/settings/{name}', data);
				// 	expect(data.result).to.have.property('id');
				// 	expect(data.result.id).to.be.greaterThan(0);
				// });

				// cy.task('backendApiPut', {
				// 	token: token,
				// 	path:  '/api/settings/auth-methods',
				// 	data:  {
				// 		value: [
				// 			'local',
				// 			'oauth'
				// 		]
				// 	}
				// }).then((data) => {
				// 	cy.validateSwaggerSchema('put', 200, '/settings/{name}', data);
				// 	expect(data.result).to.have.property('id');
				// 	expect(data.result.id).to.be.greaterThan(0);
				// });
			});
		});

		it.skip('Should log in with OAuth', function() {
			// cy.task('backendApiGet', {
			// 	path:  '/oauth/login?redirect_base=' + encodeURI(Cypress.config('baseUrl')),
			// }).then((data) => {
			// 	expect(data).to.have.property('result');

			// 	cy.origin('http://authentik:9000', {args: data.result}, (url) => {
			// 		cy.visit(url);
			// 		cy.get('ak-flow-executor')
			// 		.shadow()
			// 		.find('ak-stage-identification')
			// 		.shadow()
			// 		.find('input[name="uidField"]', { visible: true })
			// 		.type('cypress');

			// 	cy.get('ak-flow-executor')
			// 		.shadow()
			// 		.find('ak-stage-identification')
			// 		.shadow()
			// 		.find('button[type="submit"]', { visible: true })
			// 		.click();

			// 	cy.get('ak-flow-executor')
			// 		.shadow()
			// 		.find('ak-stage-password')
			// 		.shadow()
			// 		.find('input[name="password"]', { visible: true })
			// 		.type('fqXBfUYqHvYqiwBHWW7f');

			// 	cy.get('ak-flow-executor')
			// 		.shadow()
			// 		.find('ak-stage-password')
			// 		.shadow()
			// 		.find('button[type="submit"]', { visible: true })
			// 		.click();
			// 	})

			// 	// we should be logged in
			// 	cy.get('#root p.chakra-text')
			// 		.first()
			// 		.should('have.text', 'Nginx Proxy Manager');

			// 	// logout:
			// 	cy.clearLocalStorage();
			// });
		});
	}
});
