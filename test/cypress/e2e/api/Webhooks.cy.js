/// <reference types="cypress" />

describe('Webhooks endpoints', () => {
	let token;
	let webhookId;

	before(() => {
		cy.resetUsers();
		cy.getToken().then((tok) => {
			token = tok;
		});
	});

	it('List webhooks', () => {
		cy.task('backendApiGet', {
			token: token,
			path: '/api/webhooks',
		}).then((data) => {
			cy.validateSwaggerSchema('get', 200, '/webhooks', data);
			expect(data).to.be.an('array');
		});
	});

	it('Create and delete webhook', () => {
		cy.task('backendApiPost', {
			token: token,
			path: '/api/webhooks',
			data: {
				name: 'Cypress webhook',
				url: 'http://127.0.0.1:65535/npm-webhook-test',
				events: ['certificate.created'],
			},
		}).then((data) => {
			cy.validateSwaggerSchema('post', 201, '/webhooks', data);
			expect(data).to.have.property('id');
			webhookId = data.id;

			cy.task('backendApiDelete', {
				token: token,
				path: `/api/webhooks/${webhookId}`,
			}).then((deleted) => {
				expect(deleted).to.equal(true);
			});
		});
	});
});
