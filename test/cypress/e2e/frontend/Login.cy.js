/// <reference types="cypress" />

describe('Frontend Login', () => {
	it('Login works', function() {
        cy.intercept('/api/users/me*').as('getCurrentUser')

		cy.visit("/")
        cy.get('input[name="identity"]').type("admin@example.com")
        cy.get('input[name="secret"]').type("changeme")
        cy.get('button[type=submit]').click()

        cy.wait("@getCurrentUser")
	});
});
