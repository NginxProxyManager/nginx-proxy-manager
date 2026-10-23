/// <reference types="cypress" />

describe('SSO session revocation boundaries', () => {
	let adminToken;
	let connectionID;

	const loginThroughOIDC = () => {
		cy.clearLocalStorage();
		cy.visit('/login');
		cy.contains('Fixture OIDC').click();
		cy.contains('Waiting for access', {timeout: 30000}).should('be.visible');
		return cy.window().then((win) => JSON.parse(win.localStorage.getItem('authentications'))[0].token);
	};

	before(() => {
		cy.requireSSOEnvironment();
		cy.getToken().then((value) => {
			adminToken = value;
			cy.ssoAdminApi('get', '/connections', adminToken).then(({result}) => {
				connectionID = result.find((item) => item.name === 'Fixture OIDC')?.id;
				expect(connectionID, 'Fixture OIDC connection').to.be.a('string');
			});
		});
	});

	it('revokes an SSO session when its shared email is removed and re-add does not revive it', () => {
		loginThroughOIDC().then((sessionToken) => cy.ssoAdminApi('get', '/allowlist', adminToken).then(({result}) => {
			return cy.ssoAdminApi('put', '/allowlist', adminToken, {revision: result.revision, emails: []}).then(({result: removed}) => {
				return cy.task('backendApiGet', {token: sessionToken, path: '/api/users/me', returnOnError: true})
					.its('error.code').should('equal', 401);
			}).then(() => cy.ssoAdminApi('get', '/allowlist', adminToken)).then(({result: current}) =>
				cy.ssoAdminApi('put', '/allowlist', adminToken, {revision: current.revision, emails: ['allowed@example.com']})).then(() => {
					cy.task('backendApiGet', {token: sessionToken, path: '/api/users/me', returnOnError: true})
						.its('error.code').should('equal', 401);
			});
		}));
	});

	it('display-name edit preserves a session but disabling its provider revokes it', () => {
		loginThroughOIDC().then((token) => cy.ssoAdminApi('get', `/connections/${connectionID}`, adminToken).then(({result}) => {
			cy.ssoAdminApi('put', `/connections/${connectionID}`, adminToken, {
				revision: result.revision, protocol: result.protocol, enabled: result.enabled, config: result.config,
				name: `${result.name} renamed`, secret_action: 'keep',
			}).then(({result: renamed}) => {
				cy.task('backendApiGet', {token, path: '/api/users/me'}).its('result.id').should('be.greaterThan', 0);
				cy.ssoAdminApi('put', `/connections/${connectionID}`, adminToken, {
					revision: renamed.revision, protocol: renamed.protocol, name: renamed.name,
					enabled: false, config: renamed.config, secret_action: 'keep',
				}).then(() => cy.task('backendApiGet', {token, path: '/api/users/me', returnOnError: true})
					.its('error.code').should('equal', 401));
			});
		}));
	});
});
