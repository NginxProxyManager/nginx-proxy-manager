/// <reference types="cypress" />

describe('Admin SSO browser flow', () => {
	before(() => cy.requireSSOEnvironment());

	const adminToken = () => cy.task('backendApiPost', {
		path: '/api/auth',
		data: {type: 'local', identity: 'cypress@example.com', secret: 'changeme'},
	}).its('result.token');
	const storedToken = () => cy.window().should((win) => {
		expect(win.localStorage.getItem('authentications')).to.be.a('string');
	}).then((win) => JSON.parse(win.localStorage.getItem('authentications'))[0].token);

	const loginThrough = (provider) => {
		cy.clearLocalStorage();
		cy.visit('/login');
		cy.contains(provider).click();
		cy.location('search', {timeout: 30000}).should('not.contain', 'sso_handoff');
		cy.location('href').should('not.contain', 'token=');
		cy.contains(/waiting|pending|access/i).should('be.visible');
	};

	it('shows every named provider beside password login without auto redirect', () => {
		cy.clearLocalStorage();
		cy.visit('/login');
		cy.location('pathname').should('match', /login|\//);
		cy.contains('Fixture OIDC').should('be.visible');
		cy.contains('Fixture OAuth2').should('be.visible');
		cy.get('input[name="email"]').should('be.visible');
	});

	it('performs a real OIDC handoff with no token in the URL and reaches pending access', () => {
		loginThrough('Fixture OIDC');
	});

	it('performs a real OAuth2 handoff', () => {
		loginThrough('Fixture OAuth2');
	});

	it('performs a real cross-origin SAML POST handoff', () => {
		loginThrough('Fixture SAML');
	});

	it('NPM logout does not log the browser out of the provider', () => {
		loginThrough('Fixture OIDC');
		cy.contains('button', /log\s*out/i).click();
		cy.contains('Fixture OIDC').should('be.visible');
		cy.contains('Fixture OIDC').click();
		cy.location('search', {timeout: 30000}).should('not.contain', 'sso_handoff');
		cy.contains(/waiting|pending|access/i).should('be.visible');
	});

	it('keeps one account ID across pending grant and a later SSO login', () => {
		loginThrough('Fixture OIDC');
		storedToken().then((token) =>
			cy.task('backendApiGet', {token, path: '/api/users/me'})).then(({result: first}) => {
			expect(first.capabilities).to.deep.equal([]);
			adminToken().then((admin) => cy.task('backendApiPut', {
				token: admin,
				path: `/api/users/${first.id}`,
				data: {capabilities: ['hosts.view']},
			}));
			cy.contains('Waiting for access', {timeout: 10000}).should('not.exist');
			cy.get('[aria-label="Open user menu"]').click();
			cy.contains(/log\s*out/i).click();
			cy.contains('Fixture OIDC').click();
			storedToken().then((token) =>
				cy.task('backendApiGet', {token, path: '/api/users/me'})).its('result.id').should('equal', first.id);
			adminToken().then((admin) => cy.task('backendApiPut', {
				token: admin,
				path: `/api/users/${first.id}`,
				data: {capabilities: []},
			}));
		});
	});

	it('denies an unlisted or inactive email and supports the SSO-only administrator escape', () => {
		let admin;
		adminToken().then((token) => {
			admin = token;
			return cy.ssoAdminApi('get', '/allowlist', admin);
		}).then(({result}) => cy.ssoAdminApi('put', '/allowlist', admin, {
			revision: result.revision,
			emails: [],
		})).then(() => {
			cy.clearLocalStorage();
			cy.visit('/login');
			cy.contains('Fixture OIDC').click();
			cy.location('search', {timeout: 30000}).should('contain', 'sso_error=');
		}).then(() => cy.ssoAdminApi('get', '/allowlist', admin)).then(({result}) => cy.ssoAdminApi('put', '/allowlist', admin, {
			revision: result.revision,
			emails: ['allowed@example.com'],
		})).then(() => cy.task('backendApiGet', {token: admin, path: '/api/users'})).then(({result}) => {
			const linked = result.items.find((user) => user.email === 'allowed@example.com');
			return cy.task('backendApiPut', {token: admin, path: `/api/users/${linked.id}`, data: {is_disabled: true}})
				.then(() => {
					cy.visit('/login');
					cy.contains('Fixture OIDC').click();
					cy.location('search', {timeout: 30000}).should('contain', 'sso_error=');
				}).then(() => cy.task('backendApiPut', {token: admin, path: `/api/users/${linked.id}`, data: {is_disabled: false}}));
		}).then(() => cy.ssoAdminApi('get', '/policy', admin)).then(({result}) => cy.ssoAdminApi('put', '/policy', admin, {
			...result,
			mode: 'sso_only',
		})).then(({result}) => {
			cy.visit('/login');
			cy.get('input[name="email"]').should('not.exist');
			cy.contains(/administrator.*password/i).click();
			cy.get('input[name="email"]').should('be.visible');
			return cy.ssoAdminApi('put', '/policy', admin, {...result, mode: 'parallel'});
		});
	});

	it('captures sanitized desktop and mobile acceptance screenshots', () => {
		adminToken().then((admin) => cy.task('backendApiGet', {token: admin, path: '/api/users'}).then(({result}) => {
			const linked = result.items.find((user) => user.email === 'allowed@example.com');
			if (linked) {
				return cy.task('backendApiPut', {token: admin, path: `/api/users/${linked.id}`, data: {capabilities: []}});
			}
		}));
		cy.viewport(1280, 720);
		cy.clearLocalStorage();
		cy.visit('/login');
		cy.contains('Fixture OIDC').should('be.visible');
		cy.screenshot('sso-login-desktop', {capture: 'viewport'});
		cy.viewport(390, 844);
		loginThrough('Fixture OIDC');
		cy.screenshot('sso-pending-mobile', {capture: 'viewport'});
	});
});
