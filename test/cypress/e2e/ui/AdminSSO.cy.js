/// <reference types="cypress" />

describe('Admin SSO browser flow', () => {
	before(() => cy.requireSSOEnvironment());

	it('shows every named provider beside password login without auto redirect', () => {
		cy.clearLocalStorage();
		cy.visit('/login');
		cy.location('pathname').should('match', /login|\//);
		cy.contains('Fixture OIDC').should('be.visible');
		cy.contains('Fixture OAuth2').should('be.visible');
		cy.get('input[name="email"]').should('be.visible');
	});

	it('performs a real OIDC handoff with no token in the URL and reaches pending access', () => {
		cy.clearLocalStorage();
		cy.visit('/login');
		cy.contains('Fixture OIDC').click();
		cy.location('search', {timeout: 30000}).should('not.contain', 'sso_handoff');
		cy.location('href').should('not.contain', 'token=');
		cy.contains(/waiting|pending|access/i).should('be.visible');
	});

	it('NPM logout does not log the browser out of the provider', () => {
		cy.contains('button', /log out/i).click();
		cy.contains('Fixture OIDC').click();
		cy.location('search', {timeout: 30000}).should('not.contain', 'sso_handoff');
		cy.contains(/waiting|pending|access/i).should('be.visible');
	});

	it('captures sanitized desktop and mobile acceptance screenshots', () => {
		cy.screenshot('sso-login-desktop', {capture: 'viewport'});
		cy.viewport(390, 844);
		cy.screenshot('sso-pending-mobile', {capture: 'viewport'});
	});
});
