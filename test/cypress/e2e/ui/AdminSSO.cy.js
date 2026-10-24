/// <reference types="cypress" />

describe('Admin SSO browser flow', () => {
	before(() => cy.requireSSOEnvironment());

	const adminToken = () => cy.task('backendApiPost', {
		path: '/api/auth',
		data: {type: 'local', identity: 'cypress@example.com', secret: 'changeme'},
	}).its('result.token');
	const adminAuthentication = () => cy.task('backendApiPost', {
		path: '/api/auth',
		data: {type: 'local', identity: 'cypress@example.com', secret: 'changeme'},
	}).its('result');
	const storedToken = () => cy.window().should((win) => {
		expect(win.localStorage.getItem('authentications')).to.be.a('string');
	}).then((win) => JSON.parse(win.localStorage.getItem('authentications'))[0].token);
	const openSSOSettings = () => adminAuthentication().then((authentication) => {
		cy.visit('/login');
		cy.window().then((win) => win.localStorage.setItem('authentications', JSON.stringify([authentication])));
		cy.visit('/settings');
		cy.contains('Single sign-on').click();
		cy.contains('h3', 'Single sign-on').should('be.visible');
	});

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

	it('keeps two simultaneous real browser targets independent when callbacks finish out of order', () => {
		if (Cypress.env('stack') !== 'postgres') {
			cy.log('Real simultaneous-tab coverage runs once in the Postgres browser matrix');
			return;
		}
		const ids = {};
		cy.request('/api/auth/providers').its('body.result.connections').then((connections) => {
			ids.slow = connections.find(({protocol}) => protocol === 'oauth2').id;
			ids.fast = connections.find(({protocol}) => protocol === 'oidc').id;
			return Cypress.automation('remote:debugger:protocol', {command:'Target.createTarget', params:{url:`${Cypress.config('baseUrl')}/sso/${ids.slow}/start`}});
		}).then(({targetId}) => {
			ids.slowTarget = targetId;
			return cy.wait(250);
		}).then(() => Cypress.automation('remote:debugger:protocol', {command:'Target.createTarget', params:{url:`${Cypress.config('baseUrl')}/sso/${ids.fast}/start`}}))
			.then(({targetId}) => { ids.fastTarget = targetId; return cy.wait(12000); })
			.then(() => Cypress.automation('remote:debugger:protocol', {command:'Target.getTargets', params:{}}))
			.then((targets) => {
				const callbacks = targets.targetInfos.filter(({type,url}) => type === 'page' && url === `${Cypress.config('baseUrl')}/login`);
				return cy.wrap(callbacks).each(({targetId}) => Cypress.automation('remote:debugger:protocol', {command:'Target.activateTarget', params:{targetId}}));
			}).then(() => cy.wait(3000)).then(() => cy.task('ssoPostgresAttemptEvidence')).then((db) => {
				const rows = db.split('\n').map((line) => line.split('\t'));
				const handoffs = rows.filter(([kind]) => kind === 'handoff');
				const sessions = rows.filter(([kind]) => kind === 'session');
				expect(handoffs.map(([,connection]) => connection)).to.include.members([ids.fast, ids.slow]);
				expect(new Set(handoffs.map(([, ,user]) => user)).size).to.equal(1);
				expect(sessions.map(([,connection]) => connection)).to.include.members([ids.fast, ids.slow]);
			});
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

	it('captures the full-admin password-login switch from the real Users page', () => {
		let admin;
		let linked;
		adminToken().then((token) => {
			admin = token;
			return cy.task('backendApiGet', {token: admin, path: '/api/users'});
		}).then(({result}) => {
			linked = result.items.find((user) => user.email === 'allowed@example.com');
			expect(linked, 'linked SSO user').to.exist;
			return cy.task('backendApiPut', {
				token: admin,
				path: `/api/users/${linked.id}`,
				data: {capabilities: ['full-admin']},
			});
		}).then(() => {
			cy.visit('/login');
			return adminAuthentication();
		}).then((authentication) => {
			cy.window().then((win) => win.localStorage.setItem('authentications', JSON.stringify([authentication])));
			cy.visit('/users');
			cy.contains('tr', 'allowed@example.com').should('be.visible').within(() => {
				cy.get('button.dropdown-toggle').click();
				cy.contains('Edit').click();
			});
			cy.get('#passwordLoginEnabled').should('be.visible').and('not.be.disabled');
			cy.contains(/administrator password login/i).should('be.visible');
			cy.viewport(1280, 720);
			cy.screenshot('sso-admin-password-switch-desktop', {capture: 'viewport'});
		}).then(() => cy.task('backendApiPut', {
			token: admin,
			path: `/api/users/${linked.id}`,
			data: {capabilities: []},
		}));
	});

	it('creates OIDC, OAuth2 and SAML connections entirely through Settings', () => {
		openSSOSettings();
		cy.viewport(1280, 900);
		cy.screenshot('sso-settings-desktop', {capture: 'viewport'});

		const add = (protocol, name, fields) => {
			cy.contains('button', 'Add connection').click();
			cy.get('form[aria-label="SSO connection"]').within(() => {
				cy.get('[aria-label="Display name"]').clear().type(name);
				cy.get('[aria-label="Protocol"]').select(protocol);
				for (const [label, value] of fields) cy.get(`[aria-label="${label}"]`).clear().type(value);
				if (protocol !== 'saml') cy.get('[aria-label="Client secret"]').clear().type('acceptance-secret');
			});
			if (protocol === 'saml') {
				cy.get('[aria-label="Use email-format NameID"]').check();
				cy.contains('button', 'Preview metadata').click();
				cy.contains('Reviewed identity provider metadata', {timeout: 30000}).should('be.visible');
			}
			if (protocol === 'oidc') cy.screenshot('sso-connection-form-desktop', {capture: 'viewport'});
			cy.get('form[aria-label="SSO connection"]').within(() => cy.contains('button', 'Save').click());
			cy.contains('SSO configuration saved.', {timeout: 30000}).should('be.visible');
			cy.contains(name).should('be.visible');
		};

		add('oidc', 'UI OIDC', [
			['Issuer URL', Cypress.env('oidcIssuer')], ['Client ID', 'ui-oidc'],
		]);
		add('oauth2', 'UI OAuth2', [
			['Authorization URL', `${Cypress.env('oauthIssuer')}/auth`],
			['Token URL', `${Cypress.env('oauthIssuer')}/token`],
			['UserInfo URL', `${Cypress.env('oauthIssuer')}/user`], ['Client ID', 'ui-oauth'],
		]);
		add('saml', 'UI SAML', [
			['IdP metadata URL', Cypress.env('samlMetadataUrl')],
			['SP entity ID', 'https://host.docker.internal/sso/ui'],
		]);

		cy.viewport(390, 844);
		cy.get('[aria-label="Login mode"]').scrollIntoView().should('be.visible');
		cy.screenshot('sso-login-modes-mobile', {capture: 'viewport'});
		adminToken().then((token) => cy.ssoAdminApi('get', '/connections', token)).its('result')
			.then((connections) => expect(connections.filter(({name}) => name.startsWith('UI ')).map(({protocol}) => protocol).sort())
				.to.deep.equal(['oauth2', 'oidc', 'saml']));
	});
});
