/// <reference types="Cypress" />

describe('UI Setup and Login', () => {

	// Clear the users before runing this test
	before(() => {
		cy.resetUsers();
	});

	it('Should be able to setup a new user', function() {
		cy.visit('/');
		cy.get('input[name="name"]').type('Cypress McGee');
		cy.get('input[name="nickname"]').type('Cypress');
		cy.get('input[name="email"]').type('cypress@example.com');
		cy.get('input[name="password"]').type('changeme');
		cy.get('form button:first').click();
		cy.get('.navbar-nav .avatar').should('be.visible');
	});

});
