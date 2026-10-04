/// <reference types="cypress" />

describe('Access Lists with security keys and tokens', () => {
	const appHost   = 'gate-app.example.com';
	const otherHost = 'gate-other.example.com';
	const pathHost  = 'gate-path.example.com';
	const origin    = `http://${appHost}`;
	const apiKey    = 'cypress-sonarr-api-key-0123456789';
	const html      = { Accept: 'text/html,application/xhtml+xml' };
	const basic     = (username, password) => ({
		Authorization: `Basic ${btoa(`${username}:${password}`)}`,
	});

	let token;
	let listId;
	let basicListId;
	let hostIds = [];
	let firstCredentialId;
	let firstKeyCookie;
	let secondKeyCookie;

	const site = (host, path = '/', headers = {}) => {
		return cy.task('gateRequest', { host, path, headers });
	};

	// The sign-in page API, called as the page itself would
	const gate = (path, body, host = appHost, pageOrigin = `http://${host}`) => {
		return cy.task('gateRequest', {
			host,
			path:    `/.npm-auth/api/${path}`,
			method:  'POST',
			headers: { Origin: pageOrigin },
			body,
		});
	};

	// nginx reloads are signalled and return immediately, so the old
	// config can still be served for a moment after an API change.
	const expectStatus = (host, path, headers, status) => {
		cy.waitUntil(() => site(host, path, headers).then((res) => res.status === status), {
			timeout:  15000,
			interval: 500,
			errorMsg: `${host}${path} did not return ${status}`,
		});
	};

	const sessionCookie = (res) => {
		expect(res.headers).to.have.property('set-cookie');
		return res.headers['set-cookie'][0].split(';')[0];
	};

	// Creates a one-time link and registers a new key from the software authenticator with it
	const registerKey = (name) => {
		return cy.task('backendApiPost', {
			token: token,
			path:  `/api/nginx/access-lists/${listId}/keys/invites`,
			data:  { name },
		}).then((invite) => {
			cy.validateSwaggerSchema('post', 200, '/nginx/access-lists/{listID}/keys/invites', invite);
			const link = invite.urls.find((u) => u.domain === appHost);
			expect(link).to.not.equal(undefined);
			const inviteToken = link.url.split('#')[1];

			return gate('enroll/options', { token: inviteToken }).then((opts) => {
				expect(opts.status).to.equal(200);
				return cy.task('softAuthenticatorCreate', { options: opts.body.options, origin }).then((response) => {
					return gate('enroll/verify', { ceremony: opts.body.ceremony, response }).then((verify) => {
						return cy.wrap({ inviteToken, response, verify });
					});
				});
			});
		});
	};

	const signIn = (credentialId) => {
		return gate('login/options', { list: listId }).then((opts) => {
			expect(opts.status).to.equal(200);
			return cy.task('softAuthenticatorGet', { options: opts.body.options, origin, credentialId }).then((response) => {
				return gate('login/verify', { list: listId, ceremony: opts.body.ceremony, response, rd: '/after' }).then((verify) => {
					return cy.wrap({ opts, response, verify });
				});
			});
		});
	};

	const updateList = (data) => {
		return cy.task('backendApiPut', {
			token: token,
			path:  `/api/nginx/access-lists/${listId}`,
			data:  { name: 'Gate', pass_auth: false, ...data },
		});
	};

	before(() => {
		cy.resetUsers();
		cy.getToken().then((tok) => {
			token = tok;
		});
		cy.task('softAuthenticatorReset');
	});

	after(() => {
		hostIds.forEach((id) => {
			cy.task('backendApiDelete', { token, path: `/api/nginx/proxy-hosts/${id}`, returnOnError: true });
		});
		[listId, basicListId].filter(Boolean).forEach((id) => {
			cy.task('backendApiDelete', { token, path: `/api/nginx/access-lists/${id}`, returnOnError: true });
		});
	});

	it('Should create an access list that accepts security keys', () => {
		cy.task('backendApiPost', {
			token: token,
			path:  '/api/nginx/access-lists',
			data:  {
				name:              'Gate',
				satisfy_any:       false,
				pass_auth:         false,
				key_auth:          true,
				key_session_hours: 24,
				items:             [{ username: 'alice', password: 'wonderland-123' }],
				clients:           [],
			},
		}).then((data) => {
			cy.validateSwaggerSchema('post', 201, '/nginx/access-lists', data);
			expect(data.key_auth).to.equal(true);
			expect(data.key_session_hours).to.equal(24);
			listId = data.id;
		});
	});

	it('Should create proxy hosts using the access list', () => {
		[appHost, otherHost].forEach((domain) => {
			cy.task('backendApiPost', {
				token: token,
				path:  '/api/nginx/proxy-hosts',
				data:  {
					domain_names:            [domain],
					forward_scheme:          'http',
					forward_host:            'examplesite',
					forward_port:            80,
					access_list_id:          listId,
					certificate_id:          0,
					meta:                    { dns_challenge: false },
					advanced_config:         '',
					locations:               [],
					block_exploits:          false,
					caching_enabled:         true,
					allow_websocket_upgrade: false,
					http2_support:           false,
					hsts_enabled:            false,
					hsts_subdomains:         false,
					ssl_forced:              false,
				},
			}).then((data) => {
				// Not validating the response schema here: a host's expanded access list has
				// never included proxy_host_count, which the access list schema requires.
				expect(data).to.have.property('id');
				hostIds.push(data.id);
			});
		});
	});

	it('Should send browsers to the sign-in page and give API clients a 401', () => {
		expectStatus(appHost, '/some/page?x=1', html, 302);
		site(appHost, '/some/page?x=1', html).then((res) => {
			expect(res.headers.location).to.equal(`/.npm-auth/login?list=${listId}&rd=${encodeURIComponent('/some/page?x=1')}`);
		});
		site(appHost, '/api/v3/series', { Accept: 'application/json' }).then((res) => {
			expect(res.status).to.equal(401);
			expect(res.headers['www-authenticate']).to.match(/^Basic /);
		});
		site(appHost, `/.npm-auth/login?list=${listId}`).then((res) => {
			expect(res.status).to.equal(200);
			expect(res.headers['content-security-policy']).to.contain("default-src 'self'");
		});
		site(appHost, `/.npm-auth/check/${listId}`).then((res) => {
			expect(res.status).to.equal(404);
		});
		gate('methods', { list: listId }).then((res) => {
			expect(res.status).to.equal(200);
			expect(res.body).to.not.have.property('name');
		});
		gate('methods', { list: listId }, appHost, 'http://evil.example.com').then((res) => {
			expect(res.status).to.equal(403);
		});
	});

	it('Should accept the list users with basic auth', () => {
		site(appHost, '/', basic('alice', 'wonderland-123')).then((res) => {
			expect(res.status).to.equal(200);
		});
		site(appHost, '/', basic('alice', 'wrong')).then((res) => {
			expect(res.status).to.equal(401);
		});
	});

	it('Should accept header tokens', () => {
		cy.task('backendApiPost', {
			token: token,
			path:  `/api/nginx/access-lists/${listId}/tokens`,
			data:  { name: 'Sonarr', header_name: 'X-Api-Key', value: apiKey, forward: true },
		}).then((data) => {
			cy.validateSwaggerSchema('post', 201, '/nginx/access-lists/{listID}/tokens', data);
			expect(data).to.not.have.property('token_hash');
		});
		// Headers NPM sets for the check itself can't be used
		cy.task('backendApiPost', {
			token:         token,
			path:          `/api/nginx/access-lists/${listId}/tokens`,
			data:          { name: 'Bad', header_name: 'X-NPM-Gate-Host', value: apiKey },
			returnOnError: true,
		}).then((res) => {
			expect(res.error.code).to.equal(400);
		});
		expectStatus(appHost, '/', { 'X-Api-Key': apiKey }, 200);
		site(appHost, '/', { 'X-Api-Key': `${apiKey}-wrong` }).then((res) => {
			expect(res.status).to.equal(401);
		});
	});

	it('Should register security keys with one-time links', () => {
		registerKey('Primary key').then(({ inviteToken, response, verify }) => {
			expect(verify.status).to.equal(200);
			firstCredentialId = response.id;
			firstKeyCookie = sessionCookie(verify);
			site(appHost, '/', { Cookie: firstKeyCookie }).then((res) => {
				expect(res.status).to.equal(200);
			});
			gate('enroll/info', { token: inviteToken }).then((res) => {
				expect(res.status).to.equal(400);
				expect(res.body.error.message).to.contain('already been used');
			});
		});
		registerKey('Backup key').then(({ verify }) => {
			expect(verify.status).to.equal(200);
		});
	});

	it('Should list keys and tokens without secrets', () => {
		cy.task('backendApiGet', {
			token: token,
			path:  `/api/nginx/access-lists/${listId}?expand=keys,tokens`,
		}).then((data) => {
			cy.validateSwaggerSchema('get', 200, '/nginx/access-lists/{listID}', data);
			expect(data.keys).to.have.length(2);
			expect(data.tokens).to.have.length(1);
			expect(data.keys[0]).to.not.have.property('public_key');
			expect(data.keys[0]).to.not.have.property('credential_id');
			expect(data.keys[0].rp_id).to.equal('example.com');
		});
	});

	it('Should sign in with any registered key', () => {
		signIn(firstCredentialId).then(({ opts, response, verify }) => {
			expect(opts.body.options.allowCredentials).to.have.length(2);
			expect(verify.status).to.equal(200);
			expect(verify.body.redirect).to.equal('/after');
			// The challenge can only be used once
			gate('login/verify', { list: listId, ceremony: opts.body.ceremony, response }).then((res) => {
				expect(res.status).to.equal(400);
			});
		});
		cy.task('backendApiGet', { token, path: `/api/nginx/access-lists/${listId}?expand=keys` }).then((data) => {
			const backup = data.keys.find((k) => k.name === 'Backup key');
			expect(backup.last_used_on).to.equal(null);
		});
		gate('login/options', { list: listId }).then((opts) => {
			const backupId = opts.body.options.allowCredentials.map((c) => c.id).find((id) => id !== firstCredentialId);
			signIn(backupId).then(({ verify }) => {
				expect(verify.status).to.equal(200);
				secondKeyCookie = sessionCookie(verify);
			});
		});
	});

	it('Should only accept a session on the host it was made for', () => {
		site(otherHost, '/', { Cookie: firstKeyCookie }).then((res) => {
			expect(res.status).to.equal(401);
		});
	});

	it('Should rename and remove keys', () => {
		cy.task('backendApiGet', { token, path: `/api/nginx/access-lists/${listId}?expand=keys` }).then((data) => {
			const primary = data.keys.find((k) => k.name === 'Primary key');
			cy.task('backendApiPut', {
				token: token,
				path:  `/api/nginx/access-lists/${listId}/keys/${primary.id}`,
				data:  { name: 'Primary YubiKey' },
			}).then((key) => {
				cy.validateSwaggerSchema('put', 200, '/nginx/access-lists/{listID}/keys/{keyID}', key);
				expect(key.name).to.equal('Primary YubiKey');
			});
			site(appHost, '/', { Cookie: firstKeyCookie }).then((res) => {
				expect(res.status).to.equal(200);
			});

			cy.task('backendApiDelete', {
				token: token,
				path:  `/api/nginx/access-lists/${listId}/keys/${primary.id}`,
			}).then((res) => {
				cy.validateSwaggerSchema('delete', 200, '/nginx/access-lists/{listID}/keys/{keyID}', res);
			});
			// Sessions from the removed key end straight away, others carry on
			site(appHost, '/', { Cookie: firstKeyCookie }).then((res) => {
				expect(res.status).to.equal(401);
			});
			site(appHost, '/', { Cookie: secondKeyCookie }).then((res) => {
				expect(res.status).to.equal(200);
			});
			signIn(firstCredentialId).then(({ verify }) => {
				expect(verify.status).to.equal(400);
			});
		});
	});

	it('Should work from an https page when TLS ends at a proxy in front of NPM', () => {
		const httpsOrigin = `https://${appHost}`;
		cy.task('backendApiPost', {
			token: token,
			path:  `/api/nginx/access-lists/${listId}/keys/invites`,
			data:  { name: 'Behind a tunnel' },
		}).then((invite) => {
			const inviteToken = invite.urls.find((u) => u.domain === appHost).url.split('#')[1];
			gate('enroll/options', { token: inviteToken }, appHost, httpsOrigin).then((opts) => {
				expect(opts.status).to.equal(200);
				cy.task('softAuthenticatorCreate', { options: opts.body.options, origin: httpsOrigin }).then((response) => {
					gate('enroll/verify', { ceremony: opts.body.ceremony, response }, appHost, httpsOrigin).then((verify) => {
						expect(verify.status).to.equal(200);
						expect(verify.headers['set-cookie'][0]).to.match(/;\s*Secure/i);
					});
				});
			});
		});
	});

	it('Should only redirect back to the same site after signing in', () => {
		['/\t/evil.example.com/', '//evil.example.com/', '/\\evil.example.com/', 'https://evil.example.com/', '/.//evil.example.com/', '/a/..//evil.example.com/', '/%2e//evil.example.com/'].forEach((rd) => {
			gate('login/password', { list: listId, username: 'alice', password: 'wonderland-123', rd }).then((res) => {
				expect(res.status).to.equal(200);
				expect(res.body.redirect).to.equal('/');
			});
		});
		gate('login/password', { list: listId, username: 'alice', password: 'wonderland-123', rd: '/a/b?c=1' }).then((res) => {
			expect(res.body.redirect).to.equal('/a/b?c=1');
		});
	});

	it('Should sign in with a password on the sign-in page', () => {
		gate('login/password', { list: listId, username: 'alice', password: 'wonderland-123', rd: '//evil.example.com/' }).then((res) => {
			expect(res.status).to.equal(200);
			expect(res.body.redirect).to.equal('/');
			const cookie = sessionCookie(res);
			site(appHost, '/', { Cookie: cookie }).then((page) => {
				expect(page.status).to.equal(200);
			});

			// Changing the password ends sessions started with the old one
			updateList({ satisfy_any: false, items: [{ username: 'alice', password: 'new-password-456' }] });
			expectStatus(appHost, '/', { Cookie: cookie }, 401);
		});
	});

	it('Should let allowed addresses through with Satisfy Any', () => {
		updateList({ satisfy_any: true, clients: [{ directive: 'allow', address: '0.0.0.0/0' }] });
		expectStatus(appHost, '/', {}, 200);
		updateList({ satisfy_any: false, clients: [{ directive: 'allow', address: '0.0.0.0/0' }] });
		expectStatus(appHost, '/', {}, 401);
		site(appHost, '/', { Cookie: secondKeyCookie }).then((res) => {
			expect(res.status).to.equal(200);
		});
		updateList({ satisfy_any: false, clients: [] });
	});

	it('Should combine a basic auth list on the host with a key list on a location', () => {
		cy.task('backendApiPost', {
			token: token,
			path:  '/api/nginx/access-lists',
			data:  {
				name:        'Host users',
				satisfy_any: false,
				pass_auth:   false,
				items:       [{ username: 'bob', password: 'builder-123' }],
				clients:     [],
			},
		}).then((basicList) => {
			basicListId = basicList.id;
			cy.task('backendApiPost', {
				token: token,
				path:  '/api/nginx/proxy-hosts',
				data:  {
					domain_names:            [pathHost],
					forward_scheme:          'http',
					forward_host:            'examplesite',
					forward_port:            80,
					access_list_id:          basicList.id,
					certificate_id:          0,
					meta:                    { dns_challenge: false },
					advanced_config:         '',
					locations:               [{ path: '/dashboard', forward_scheme: 'http', forward_host: 'examplesite', forward_port: 80, access_list_id: listId }],
					block_exploits:          false,
					caching_enabled:         false,
					allow_websocket_upgrade: false,
					http2_support:           false,
					hsts_enabled:            false,
					hsts_subdomains:         false,
					ssl_forced:              false,
				},
			}).then((host) => {
				hostIds.push(host.id);
			});
		});

		expectStatus(pathHost, '/dashboard', html, 302);
		site(pathHost, '/', html).then((res) => {
			expect(res.status).to.equal(401);
			expect(res.headers['www-authenticate']).to.match(/^Basic /);
		});
		site(pathHost, '/', basic('bob', 'builder-123')).then((res) => {
			expect(res.status).to.equal(200);
		});
		site(pathHost, '/dashboard', basic('bob', 'builder-123')).then((res) => {
			expect(res.status).to.equal(401);
		});
		gate('login/password', { list: listId, username: 'alice', password: 'new-password-456', rd: '/dashboard' }, pathHost).then((res) => {
			expect(res.status).to.equal(200);
			expect(res.body.redirect).to.equal('/dashboard');
			const cookie = sessionCookie(res);
			site(pathHost, '/dashboard', { Cookie: cookie }).then((page) => {
				expect(page.status).to.equal(200);
			});
			// A session for the location's list doesn't open the rest of the host
			site(pathHost, '/', { Cookie: cookie }).then((page) => {
				expect(page.status).to.equal(401);
			});
		});
	});

	it('Should go back to nginx basic auth without keys or tokens', () => {
		cy.task('backendApiGet', { token, path: `/api/nginx/access-lists/${listId}?expand=tokens` }).then((data) => {
			cy.task('backendApiDelete', {
				token: token,
				path:  `/api/nginx/access-lists/${listId}/tokens/${data.tokens[0].id}`,
			}).then((res) => {
				cy.validateSwaggerSchema('delete', 200, '/nginx/access-lists/{listID}/tokens/{tokenID}', res);
			});
		});
		updateList({ satisfy_any: false, key_auth: false });
		// The browser now gets nginx's own basic auth prompt instead of the sign-in page
		expectStatus(appHost, '/', html, 401);
		site(appHost, '/', html).then((res) => {
			expect(res.headers['www-authenticate']).to.match(/^Basic /);
		});
		site(appHost, '/', basic('alice', 'new-password-456')).then((res) => {
			expect(res.status).to.equal(200);
		});
	});
});
