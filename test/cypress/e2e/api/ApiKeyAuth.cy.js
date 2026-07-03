/// <reference types="cypress" />

describe('API key authentication', () => {
	let adminToken;
	let apiKey;

	before(() => {
		cy.resetUsers();
		cy.getToken().then((tok) => {
			adminToken = tok;
		});
	});

	it('API key can list proxy hosts', () => {
		cy.task('backendApiPost', {
			token: adminToken,
			path: '/api/api-keys',
			data: {
				name: 'Cypress proxy read',
				permissions: {
					proxy_hosts: 'manage',
					certificates: 'view',
					credentials: 'view',
				},
			},
		}).then((data) => {
			expect(data).to.have.property('key');
			apiKey = data.key;

			cy.task('backendApiGet', {
				token: apiKey,
				path: '/api/nginx/proxy-hosts',
			}).then((hosts) => {
				cy.validateSwaggerSchema('get', 200, '/nginx/proxy-hosts', hosts);
				expect(hosts).to.be.an('array');
			});
		});
	});
});
