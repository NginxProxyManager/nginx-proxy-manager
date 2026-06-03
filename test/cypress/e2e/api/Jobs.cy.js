/// <reference types="cypress" />

describe('Jobs endpoints', () => {
	let token;

	before(() => {
		cy.resetUsers();
		cy.getToken().then((tok) => {
			token = tok;
		});
	});

	it('List jobs', () => {
		cy.task('backendApiGet', {
			token: token,
			path: '/api/jobs',
		}).then((data) => {
			cy.validateSwaggerSchema('get', 200, '/jobs', data);
			expect(data).to.be.an('array');
		});
	});

	it('Create certificate with async=true returns job', () => {
		cy.task('backendApiPost', {
			token: token,
			path: '/api/nginx/certificates?async=true',
			data: {
				domain_names: ['async-job.example.com'],
				meta: { dns_challenge: false },
				provider: 'letsencrypt',
			},
		}).then((data) => {
			expect(data).to.have.property('job_id');
			expect(data).to.have.property('status');

			cy.task('backendApiGet', {
				token: token,
				path: `/api/jobs/${data.job_id}`,
			}).then((job) => {
				cy.validateSwaggerSchema('get', 200, '/jobs/{jobID}', job);
				expect(job).to.have.property('id', data.job_id);
				expect(job).to.have.property('status');
			});
		});
	});
});
