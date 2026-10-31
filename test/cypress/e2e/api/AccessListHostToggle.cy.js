/// <reference types="cypress" />

// Regression tests for #5919, #4286 and #5710: access list rules must survive
// every path that re-renders a proxy host config, not just the initial save.
describe('Access Lists across Proxy Host disable/enable', () => {
	const domain = 'website4.example.com';

	const creds = {
		username: 'toggle-user',
		password: 'toggle-pass',
	};

	let token;
	let authListId;
	let clientListId;
	let hostId;

	/**
	 * Requests a path on the proxy host directly (bypassing squid)
	 * and yields the HTTP status code
	 *
	 * @param {object}  [auth]
	 * @param {string}  auth.username
	 * @param {string}  auth.password
	 */
	const request = (auth) => {
		const authArg = auth ? `-u '${auth.username}:${auth.password}'` : '';
		return cy.exec(`curl --noproxy '*' -s -o /dev/null -w '%{http_code}' ${authArg} http://${domain}/`)
			.then((result) => {
				expect(result.exitCode).to.eq(0);
				return result.stdout.trim();
			});
	};

	// nginx reloads are signalled and return immediately, so the old
	// config can still be served for a moment after an API change.
	// Retry until the expected status is seen.
	const expectStatus = (auth, status) => {
		let last = null;
		cy.waitUntil(() => request(auth).then((res) => {
			last = res;
			return res === status;
		}), {
			timeout:  15000,
			interval: 500,
			errorMsg: () => `${domain} did not return ${status}, last status: ${last}`,
		});
	};

	const createAccessList = (data) => {
		return cy.task('backendApiPost', {
			token: token,
			path:  '/api/nginx/access-lists',
			data:  {
				satisfy_any: false,
				pass_auth:   false,
				items:       [],
				clients:     [],
				...data,
			}
		}).then((res) => {
			cy.validateSwaggerSchema('post', 201, '/nginx/access-lists', res);
			expect(res).to.have.property('id');
			expect(res.id).to.be.greaterThan(0);
			return cy.wrap(res.id);
		});
	};

	const setHostAccessList = (accessListId) => {
		cy.task('backendApiPut', {
			token: token,
			path:  `/api/nginx/proxy-hosts/${hostId}`,
			data:  {
				access_list_id: accessListId,
			}
		}).then((data) => {
			// No swagger validation here: with a host access list set, the expanded
			// access_list in the response has no proxy_host_count, which the schema requires
			expect(data).to.have.property('access_list_id', accessListId);
		});
	};

	const toggleHost = () => {
		cy.task('backendApiPost', {
			token: token,
			path:  `/api/nginx/proxy-hosts/${hostId}/disable`,
		}).then((data) => {
			cy.validateSwaggerSchema('post', 200, '/nginx/proxy-hosts/{hostID}/disable', data);
			expect(data).to.be.equal(true);
		});

		cy.task('backendApiPost', {
			token: token,
			path:  `/api/nginx/proxy-hosts/${hostId}/enable`,
		}).then((data) => {
			cy.validateSwaggerSchema('post', 200, '/nginx/proxy-hosts/{hostID}/enable', data);
			expect(data).to.be.equal(true);
		});
	};

	before(() => {
		cy.resetUsers();
		cy.getToken().then((tok) => {
			token = tok;
		});
	});

	it('Should be able to create an auth access list and a client access list', () => {
		createAccessList({
			name:  'Toggle Auth',
			items: [creds],
		}).then((id) => {
			authListId = id;
		});

		// The test runner is never in this range, so it must always be denied
		createAccessList({
			name:    'Toggle Clients',
			clients: [
				{
					directive: 'allow',
					address:   '203.0.113.0/24',
				}
			],
		}).then((id) => {
			clientListId = id;
		});
	});

	it('Should be able to create a proxy host without an access list', () => {
		cy.task('backendApiPost', {
			token: token,
			path:  '/api/nginx/proxy-hosts',
			data:  {
				domain_names:   [domain],
				forward_scheme: 'http',
				forward_host:   'examplesite',
				forward_port:   80,
				access_list_id: 0,
				certificate_id: 0,
				meta:           {
					dns_challenge: false
				},
				advanced_config:         '',
				locations:               [],
				block_exploits:          false,
				caching_enabled:         false,
				allow_websocket_upgrade: false,
				http2_support:           false,
				hsts_enabled:            false,
				hsts_subdomains:         false,
				ssl_forced:              false
			}
		}).then((data) => {
			cy.validateSwaggerSchema('post', 201, '/nginx/proxy-hosts', data);
			expect(data).to.have.property('id');
			expect(data.id).to.be.greaterThan(0);
			hostId = data.id;
		});

		expectStatus(null, '200');
	});

	it('Should enforce an auth access list applied to an existing host', () => {
		setHostAccessList(authListId);
		expectStatus(null, '401');
		expectStatus(creds, '200');
	});

	it('Should still enforce the auth access list after the host is disabled and enabled', () => {
		toggleHost();
		expectStatus(null, '401');
		expectStatus(creds, '200');
	});

	it('Should enforce a client access list applied to an existing host', () => {
		setHostAccessList(clientListId);
		expectStatus(null, '403');
	});

	it('Should still enforce the client access list after the host is disabled and enabled', () => {
		toggleHost();
		expectStatus(null, '403');
	});

	it('Should be able to delete the proxy host and access lists', () => {
		cy.task('backendApiDelete', {
			token: token,
			path:  `/api/nginx/proxy-hosts/${hostId}`,
		}).then((data) => {
			cy.validateSwaggerSchema('delete', 200, '/nginx/proxy-hosts/{hostID}', data);
			expect(data).to.be.equal(true);
		});

		// Each delete signals an nginx reload and returns immediately. A request
		// made while the workers are being swapped can be reset by the nginx
		// serving the API (502 from squid), so let each reload settle first.
		[authListId, clientListId].forEach((id) => {
			cy.wait(1500);
			cy.task('backendApiDelete', {
				token: token,
				path:  `/api/nginx/access-lists/${id}`,
			}).then((data) => {
				cy.validateSwaggerSchema('delete', 200, '/nginx/access-lists/{listID}', data);
				expect(data).to.be.equal(true);
			});
		});
	});

});
