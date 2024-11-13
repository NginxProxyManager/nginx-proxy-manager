/// <reference types="cypress" />

describe('OAuth with Authentik', () => {
	let token;
	if (Cypress.env('skipStackCheck') === 'true' || Cypress.env('stack') === 'postgres') {

		before(() => {
			cy.resetUsers();
			cy.getToken().then((tok) => {
				token = tok;

				cy.task('backendApiPut', {
					token: token,
					path:  '/api/settings/oauth-auth',
					data:  {
						value: {
							client_id: '7iO2AvuUp9JxiSVkCcjiIbQn4mHmUMBj7yU8EjqU',
							client_secret: 'VUMZzaGTrmXJ8PLksyqzyZ6lrtz04VvejFhPMBP9hGZNCMrn2LLBanySs4ta7XGrDr05xexPyZT1XThaf4ubg00WqvHRVvlu4Naa1aMootNmSRx3VAk6RSslUJmGyHzq',
							authorization_url: 'http://authentik:9000/application/o/authorize/',
							resource_url: 'http://authentik:9000/application/o/userinfo/',
							token_url: 'http://authentik:9000/application/o/token/',
							logout_url: 'http://authentik:9000/application/o/npm/end-session/',
							identifier: 'preferred_username',
							scopes: [],
							auto_create_user: true
						}
					}
				}).then((data) => {
					cy.validateSwaggerSchema('put', 200, '/settings/{name}', data);
					expect(data.result).to.have.property('id');
					expect(data.result.id).to.be.greaterThan(0);
				});

				cy.task('backendApiPut', {
					token: token,
					path:  '/api/settings/auth-methods',
					data:  {
						value: [
							'local',
							'oauth'
						]
					}
				}).then((data) => {
					cy.validateSwaggerSchema('put', 200, '/settings/{name}', data);
					expect(data.result).to.have.property('id');
					expect(data.result.id).to.be.greaterThan(0);
				});
			});
		});

		it('Should log in with OAuth', function() {
			cy.task('backendApiGet', {
				token: token,
				path:  '/oauth/login?redirect_base=' + encodeURI('http://fullstack:81'),
			}).then((data) => {
				expect(data).to.have.property('result');
				cy.visit(data.result);
				cy.get('input[name="uidField"]').type('cypress');
				cy.get('button[type="submit"]').click();
				cy.get('input[name="password"]').type('fqXBfUYqHvYqiwBHWW7f');
				cy.get('button[type="submit"]').click();
				// confirmation page
				cy.get('button[type="submit"]').click();
				cy.url().should('match', /fullstack/)
			});
		});
	}
});
