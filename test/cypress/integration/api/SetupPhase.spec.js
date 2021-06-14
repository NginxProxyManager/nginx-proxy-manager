/// <reference types="Cypress" />

describe('Setup Phase', () => {

	before(() => {
		cy.task('backendApiDelete', {
			path: '/api/users'
		}).then((data) => {
			expect(data).to.have.property('result', true);
		});
	});

	it('Should not be able to get a token', function() {
		cy.task('backendApiPost', {
			path: '/api/tokens',
			data: {
				type:     'password',
				identity: 'jc@jc21.com',
				secret:   'changeme'
			},
			returnOnError: true
		}).then((data) => {
			cy.validateSwaggerSchema('post', 403, '/tokens', data);
			expect(data.error).to.have.property('code', 403);
			expect(data.error).to.have.property('message', 'Not available during setup phase');
		});
	});

});
