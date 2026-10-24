/// <reference types="cypress" />

describe('Retired legacy OAuth entry points', () => {
	for (const path of ['/oauth/login', '/oauth/redirect']) {
		it(`${path} cannot issue a login URL or token`, () => {
			cy.request({ url: path, failOnStatusCode: false }).then((response) => {
				expect(response.status).to.equal(410);
				expect(response.body).to.have.property('error');
				expect(response.body).not.to.have.property('token');
			});
		});
	}
});
