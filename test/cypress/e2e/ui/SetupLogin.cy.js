/// <reference types="cypress" />

describe('UI Setup and Login', () => {

	// Clear the users before runing this test
	before(() => {
		cy.resetUsers();
	});

	it('Should be able to setup a new user', function() {
		cy.visit('/');
		cy.get('input[name="name"]').type('Cypress McGee');
		cy.get('input[name="email"]').type('cypress@example.com');
		cy.get('input[name="password"]').type('changeme');
		cy.get('form button:last').click();

		cy.get('#root p.chakra-text')
			.first()
			.should('have.text', 'Nginx Proxy Manager');

		// logout:
		cy.clearLocalStorage();
	});

	it('Should be able to login and change password', function() {
		cy.visit('/');
		cy.get('input[name="email"]').type('cypress@example.com');
		cy.get('input[name="password"]').type('changeme');
		cy.get('form button:last').click();

		// change password
		cy.get('button[data-testid="profile-menu"]').should('be.visible').click();
		cy.get('button[data-testid="profile-menu-change-password"]').should('be.visible').click();
		cy.get('input[name="current"]').type('changeme');
		cy.get('input[name="password"]').type('ihavebeenchanged');
		cy.get('input[name="password2"]').type('ihavebeenchanged');
		cy.get('form button[data-testid="save"]').click();
		cy.get('form[data-testid="change-password"]').should('not.exist');

		// logout:
		cy.clearLocalStorage();
	});

});
