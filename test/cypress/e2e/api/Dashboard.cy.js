/// <reference types="cypress" />

describe('Dashboard endpoints', () => {
	let token;

	before(() => {
		cy.getToken().then((tok) => {
			token = tok;
		});
	});

	it('Should be able to get host counts', () => {
		cy.task('backendApiGet', {
			token: token,
			path:  '/api/reports/hosts'
		}).then((data) => {
			cy.validateSwaggerSchema('get', 200, '/reports/hosts', data);
			expect(data).to.have.property('dead');
			expect(data).to.have.property('proxy');
			expect(data).to.have.property('redirection');
			expect(data).to.have.property('stream');
		});
	});

});
