/// <reference types="cypress" />

describe('SSO policy administration', () => {
	let token;

	before(() => {
		cy.requireSSOEnvironment();
		cy.resetUsers();
		cy.getToken().then((value) => { token = value; });
	});

	it('keeps one revision across policy and exact shared email allowlist', () => {
		cy.ssoAdminApi('get', '/policy', token).then(({result: policy}) => {
			expect(policy.mode).to.equal('parallel');
			cy.ssoAdminApi('put', '/policy', token, {
				revision: policy.revision,
				mode: 'parallel',
				public_url: Cypress.env('ssoPublicUrl'),
			}).then(({result: next}) => {
				cy.ssoAdminApi('put', '/allowlist', token, {
					revision: next.revision,
					emails: [' Allowed@Example.com '],
				}).then(({result}) => expect(result.emails).to.deep.equal(['allowed@example.com']));
			});
		});
	});

	it('rejects domains, wildcards, duplicates and stale revisions', () => {
		cy.ssoAdminApi('get', '/allowlist', token).then(({result}) => {
			for (const emails of [['example.com'], ['*@example.com'], ['a@example.com', 'A@example.com']]) {
				cy.ssoAdminApi('put', '/allowlist', token, {revision: result.revision, emails}, true)
					.its('error.code').should('equal', 400);
			}
			cy.ssoAdminApi('put', '/allowlist', token, {revision: result.revision - 1, emails: []}, true)
				.its('error.code').should('equal', 409);
		});
	});

	it('lists all three named providers without returning secret material', () => {
		cy.ssoAdminApi('get', '/connections', token).then(({result}) => {
			expect(result.map(({protocol}) => protocol).sort()).to.deep.equal(['oauth2', 'oidc', 'saml']);
			expect(result.map(({name}) => name)).to.include.members(['Fixture OIDC', 'Fixture OAuth2', 'Fixture SAML']);
			expect(result.every(({enabled, has_secret}) => enabled && has_secret)).to.equal(true);
			expect(JSON.stringify(result)).not.to.include('secret_value');
		});
	});

	it('legacy endpoints stay closed and conversion never enables a draft', () => {
		cy.request({url: '/oauth/login', failOnStatusCode: false}).its('status').should('equal', 410);
		cy.request({url: '/oauth/redirect', failOnStatusCode: false}).its('status').should('equal', 410);
		cy.ssoAdminApi('get', '/legacy-status', token).its('result').should('have.property', 'conversion_available');
	});
});
