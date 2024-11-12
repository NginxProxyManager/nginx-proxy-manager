/// <reference types="cypress" />

describe('OAuth with Authentik', () => {
	let token;
	if (Cypress.env('stack') === 'postgres') {

		before(() => {
			cy.resetUsers();
			cy.getToken().then((tok) => {
				token = tok;

				cy.task('backendApiPut', {
					token: token,
					path:  '/api/settings/oauth-auth',
					data:  {
						value: {
							client_id: 'U5gCy0ymU8OofWS4nmkAPugCbWkFkkPztap38ReD',
							client_secret: '9ZFClxwp7LzbfhIDk7k9DngQNQfwDAYqPrQMGXjFumCvQZATtXCwme20o0TnLP6uEHUkKqEFOInhxp01gVeaHCLW83iTK4PonoUnpFnXgyZAcu0H3zBxxOkVtRwACaoW',
							authorization_url: Cypress.env('authentik') + '/application/o/authorize/',
							resource_url: Cypress.env('authentik') + '/application/o/userinfo/',
							token_url: Cypress.env('authentik') + '/application/o/token/',
							logout_url: Cypress.env('authentik') + '/application/o/npm3/end-session/',
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
				path:  '/oauth/login?redirect_base=' + encodeURI(Cypress.env('oauthRedirect')),
			}).then((data) => {
				expect(data).to.have.property('result');
				cy.visit(data.result);
				cy.get('input[name="uidField"]').type('cypress');
				cy.get('button[type="submit"]').click();
				cy.get('input[name="password"]').type('fqXBfUYqHvYqiwBHWW7f');
				cy.get('button[type="submit"]').click();
				cy.url().should('match', /fullstack/)
			});
		});
	}
});
