/// <reference types="cypress" />

describe('Credentials endpoints', () => {
	let token;
	let credentialId;

	before(() => {
		cy.resetUsers();
		cy.getToken().then((tok) => {
			token = tok;
		});
	});

	it('List credentials', () => {
		cy.task('backendApiGet', {
			token: token,
			path: '/api/credentials',
		}).then((data) => {
			cy.validateSwaggerSchema('get', 200, '/credentials', data);
			expect(data).to.be.an('array');
		});
	});

	it('Create and delete credential', () => {
		cy.task('backendApiPost', {
			token: token,
			path: '/api/credentials',
			data: {
				name: 'Cypress test credential',
				dns_provider: 'acmedns',
				credentials:
					'dns_acmedns_api_url = http://127.0.0.1:80/\ndns_acmedns_registration_file = /data/acme-registration.json',
			},
		}).then((data) => {
			cy.validateSwaggerSchema('post', 201, '/credentials', data);
			expect(data).to.have.property('id');
			credentialId = data.id;

			cy.task('backendApiDelete', {
				token: token,
				path: `/api/credentials/${credentialId}`,
			}).then((deleted) => {
				expect(deleted).to.equal(true);
			});
		});
	});

	it('Migrate legacy credentials (dry run)', () => {
		cy.task('backendApiPost', {
			token: token,
			path: '/api/credentials/migrate-legacy',
			data: { dry_run: true },
		}).then((data) => {
			cy.validateSwaggerSchema('post', 200, '/credentials/migrate-legacy', data);
			expect(data).to.have.property('dry_run', true);
			expect(data).to.have.property('count');
			expect(data.results).to.be.an('array');
		});
	});
});
