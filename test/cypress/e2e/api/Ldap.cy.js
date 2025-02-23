/// <reference types="cypress" />

describe('LDAP with Authentik', () => {
	let token;
	if (Cypress.env('skipStackCheck') === 'true' || Cypress.env('stack') === 'postgres') {

		before(() => {
			cy.getToken().then((tok) => {
				token = tok;

				// cy.task('backendApiPut', {
				// 	token: token,
				// 	path:  '/api/settings/ldap-auth',
				// 	data:  {
				// 		value: {
				// 			host: 'authentik-ldap:3389',
				// 			base_dn: 'ou=users,DC=ldap,DC=goauthentik,DC=io',
				// 			user_dn: 'cn={{USERNAME}},ou=users,DC=ldap,DC=goauthentik,DC=io',
				// 			email_property: 'mail',
				// 			name_property: 'sn',
				// 			self_filter: '(&(cn={{USERNAME}})(ak-active=TRUE))',
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
				// 			'ldap'
				// 		]
				// 	}
				// }).then((data) => {
				// 	cy.validateSwaggerSchema('put', 200, '/settings/{name}', data);
				// 	expect(data.result).to.have.property('id');
				// 	expect(data.result.id).to.be.greaterThan(0);
				// });
			});
		});

		it.skip('Should log in with LDAP', function() {
			// cy.task('backendApiPost', {
			// 	token: token,
			// 	path:  '/api/auth',
			// 	data:  {
			// 		// Authentik LDAP creds:
			// 		type: 'ldap',
			// 		identity: 'cypress',
			// 		secret: 'fqXBfUYqHvYqiwBHWW7f'
			// 	}
			// }).then((data) => {
			// 	cy.validateSwaggerSchema('post', 200, '/auth', data);
			// 	expect(data.result).to.have.property('token');
			// });
		});
	}
});
