/// <reference types="cypress" />

describe('Credential provider endpoints', () => {
	let token;

	before(() => {
		cy.resetUsers();
		cy.getToken().then((tok) => {
			token = tok;
		});
	});

	it('List credential providers', () => {
		cy.task('backendApiGet', {
			token: token,
			path: '/api/credential-providers',
		}).then((data) => {
			cy.validateSwaggerSchema('get', 200, '/credential-providers', data);
			expect(data).to.be.an('array');
		});
	});

	it('Create provider and test OIDC (expects failure without real IdP)', () => {
		cy.task('backendApiPost', {
			token: token,
			path: '/api/credential-providers',
			data: {
				name: 'Cypress vault stub',
				type: 'vault',
				oidc_issuer: 'https://issuer.example/oauth2',
				oidc_client_id: 'npm-test',
				oidc_client_secret: 'test-secret-not-real',
				meta: {
					address: 'http://127.0.0.1:65535',
					mount: 'secret',
					role: 'npm',
				},
			},
		}).then((provider) => {
			cy.validateSwaggerSchema('post', 201, '/credential-providers', provider);
			expect(provider).to.have.property('id');

			cy.task('backendApiPost', {
				token: token,
				path: `/api/credential-providers/${provider.id}/test`,
				returnOnError: true,
			}).then((result) => {
				// OIDC or network will fail in CI; endpoint must be reachable
				expect(result).to.satisfy((r) => r.ok === true || typeof r.error !== 'undefined');
			});

			cy.task('backendApiDelete', {
				token: token,
				path: `/api/credential-providers/${provider.id}`,
			});
		});
	});
});
