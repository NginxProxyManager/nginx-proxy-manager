/// <reference types="cypress" />

describe('API keys endpoints', () => {
	let token;
	let apiKeyId;

	before(() => {
		cy.resetUsers();
		cy.getToken().then((tok) => {
			token = tok;
		});
	});

	it('List API keys', () => {
		cy.task('backendApiGet', {
			token: token,
			path: '/api/api-keys',
		}).then((data) => {
			cy.validateSwaggerSchema('get', 200, '/api-keys', data);
			expect(data).to.be.an('array');
		});
	});

	it('Create and revoke API key', () => {
		cy.task('backendApiPost', {
			token: token,
			path: '/api/api-keys',
			data: {
				name: 'Cypress automation key',
				permissions: {
					proxy_hosts: 'manage',
					certificates: 'manage',
					credentials: 'manage',
				},
			},
		}).then((data) => {
			cy.validateSwaggerSchema('post', 201, '/api-keys', data);
			expect(data).to.have.property('id');
			expect(data).to.have.property('key');
			expect(data.key).to.match(/^npmak_/);
			apiKeyId = data.id;

			cy.task('backendApiDelete', {
				token: token,
				path: `/api/api-keys/${apiKeyId}`,
			}).then((deleted) => {
				expect(deleted).to.equal(true);
			});
		});
	});
});
