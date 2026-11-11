/// <reference types="cypress" />

// One broken custom location must not take the rest of the proxy host offline,
// and a rejected host change must keep the previous, working config.
describe('Proxy Host custom location resilience', () => {
	// Not a network alias: requests go to the fullstack container with this Host header
	const domain = 'locations.example.com';

	let token;
	let hostId;

	/**
	 * Requests a path on the proxy host directly (bypassing squid)
	 * and yields the HTTP status code and response body
	 *
	 * @param {string}  path
	 */
	const request = (path) => {
		return cy.task('exec', { command: `curl --noproxy '*' -s -w '\n%{http_code}' -H 'Host: ${domain}' http://fullstack${path}` }, { log: false })
			.then((result) => {
				expect(result.exitCode).to.eq(0);
				const lines = result.stdout.trim().split('\n');
				const status = lines.pop();
				return { status: status, body: lines.join('\n') };
			});
	};

	// nginx reloads are signalled and return immediately, so the old
	// config can still be served for a moment after an API change.
	// Retry until the expected response is seen.
	const waitForResponse = (path, check, description) => {
		let last = null;
		cy.waitUntil(() => request(path).then((res) => {
			last = res;
			return check(res);
		}), {
			timeout:  15000,
			interval: 500,
			errorMsg: () => `${path} did not return ${description}, last status: ${last?.status}`,
		});
	};

	const expectStatus = (path, status) => {
		waitForResponse(path, (res) => res.status === status, status);
	};

	// Also checks the body so we know the page came from examplesite
	// and not the NPM default site
	const expectPage = (path, text) => {
		waitForResponse(path, (res) => res.status === '200' && res.body.includes(text), `200 with "${text}"`);
	};

	const location = (path, host, extra) => {
		return Object.assign({
			path:           path,
			forward_scheme: 'http',
			forward_host:   host,
			forward_port:   80,
		}, extra || {});
	};

	const goodLocations = () => {
		return [
			location('/dash', 'examplesite', { forward_path: '/dashboard' }),
			location('/ghost', 'nonexistent-upstream-npm-test'),
			location('/broken', 'examplesite', { advanced_config: 'proxy_passs http://examplesite;' }),
		];
	};

	before(() => {
		cy.resetUsers();
		cy.getToken().then((tok) => {
			token = tok;
		});
	});

	it('Should create a host even when some custom locations are broken', () => {
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
					// server owned keys sent by a client are ignored
					nginx_online: false,
					nginx_err:    'forged',
				},
				advanced_config:         '',
				locations:               goodLocations(),
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
			expect(data.meta).to.have.property('nginx_online', true);
			expect(data.meta).to.have.property('nginx_err', null);
			expect(data.meta).to.have.property('nginx_checked_at');
			expect(data.meta.nginx_locations).to.have.length(3);

			const [dash, ghost, broken] = data.meta.nginx_locations;
			expect(dash).to.include({ index: 0, path: '/dash', status: 'ok' });
			expect(ghost).to.include({ index: 1, path: '/ghost', status: 'unresolved', mode: 'dynamic' });
			expect(ghost.message).to.contain('nonexistent-upstream-npm-test');
			expect(broken).to.include({ index: 2, path: '/broken', status: 'quarantined', mode: null });
			expect(broken.message).to.contain('proxy_passs');
		});
	});

	it('Should keep serving the host and its working locations', () => {
		expectPage('/', 'this is the index page');
		expectPage('/dash', 'this is the dashboard page');
	});

	it('Should answer 502 for the unresolvable location and 503 for the quarantined one', () => {
		expectStatus('/ghost', '502');
		expectStatus('/broken', '503');
	});

	it('Should reject a broken host advanced config with details and keep the old config', () => {
		cy.task('backendApiPut', {
			token:         token,
			path:          `/api/nginx/proxy-hosts/${hostId}`,
			returnOnError: true,
			data:          {
				advanced_config: 'add_header X-Test 1;\nthis_is_not_a_directive on;',
			},
		}).then((data) => {
			cy.validateSwaggerSchema('put', 400, '/nginx/proxy-hosts/{hostID}', data);
			expect(data).to.have.property('error');
			expect(data.error).to.have.property('code', 400);
			expect(data.error.message).to.contain('Advanced configuration');
			expect(data.error.message).to.contain('this_is_not_a_directive');
			expect(data.error.message).to.contain('line 2');
			expect(data.error.details).to.include({
				kind:      'nginx_config',
				scope:     'host',
				host_type: 'proxy_host',
				host_id:   hostId,
				file:      `/data/nginx/proxy_host/${hostId}.conf`,
			});
			expect(data.error.details.nginx_output).to.contain('this_is_not_a_directive');
		});

		cy.task('backendApiGet', {
			token: token,
			path:  `/api/nginx/proxy-hosts/${hostId}`,
		}).then((data) => {
			cy.validateSwaggerSchema('get', 200, '/nginx/proxy-hosts/{hostID}', data);
			expect(data).to.have.property('advanced_config', '');
			expect(data.meta).to.have.property('nginx_online', true);
		});

		expectPage('/', 'this is the index page');
		expectPage('/dash', 'this is the dashboard page');
	});

	it('Should not render a disabled location', () => {
		const locations = goodLocations();
		locations[0].enabled = false;

		cy.task('backendApiPut', {
			token: token,
			path:  `/api/nginx/proxy-hosts/${hostId}`,
			data:  {
				locations: locations,
			},
		}).then((data) => {
			cy.validateSwaggerSchema('put', 200, '/nginx/proxy-hosts/{hostID}', data);
			expect(data.locations[0]).to.have.property('enabled', false);
			expect(data.meta.nginx_locations[0]).to.include({ index: 0, status: 'disabled', mode: null });
			expect(data.meta.nginx_locations[1]).to.have.property('status', 'unresolved');
		});

		// /dash now goes to the default location: examplesite has no /dash page
		expectStatus('/dash', '404');
		expectPage('/', 'this is the index page');
	});

	it('Should reject duplicate location paths', () => {
		cy.task('backendApiPut', {
			token:         token,
			path:          `/api/nginx/proxy-hosts/${hostId}`,
			returnOnError: true,
			data:          {
				locations: [
					location('/same', 'examplesite'),
					location('/same', 'examplesite'),
				],
			},
		}).then((data) => {
			cy.validateSwaggerSchema('put', 400, '/nginx/proxy-hosts/{hostID}', data);
			expect(data.error).to.have.property('code', 400);
			expect(data.error.message).to.contain('"/same"');
		});
	});

	it('Should not keep a host whose config nginx rejects on create', () => {
		cy.task('backendApiPost', {
			token:         token,
			path:          '/api/nginx/proxy-hosts',
			returnOnError: true,
			data:          {
				domain_names:    ['rejected-locations.example.com'],
				forward_scheme:  'http',
				forward_host:    'examplesite',
				forward_port:    80,
				access_list_id:  0,
				certificate_id:  0,
				meta:            {},
				advanced_config: 'this_is_not_a_directive on;',
				locations:       [],
			}
		}).then((data) => {
			cy.validateSwaggerSchema('post', 400, '/nginx/proxy-hosts', data);
			expect(data.error).to.have.property('code', 400);
			expect(data.error.details).to.have.property('scope', 'host');
		});

		cy.task('backendApiGet', {
			token: token,
			path:  '/api/nginx/proxy-hosts',
		}).then((data) => {
			const domains = data.flatMap((host) => host.domain_names);
			expect(domains).to.not.include('rejected-locations.example.com');
		});
	});

	it('Should pass a forward path with an nginx variable as it is', () => {
		cy.task('backendApiPut', {
			token: token,
			path:  `/api/nginx/proxy-hosts/${hostId}`,
			data:  {
				locations: [location('/q/', 'examplesite', { forward_path: '/$arg_page' })],
			},
		}).then((data) => {
			cy.validateSwaggerSchema('put', 200, '/nginx/proxy-hosts/{hostID}', data);
			expect(data.meta.nginx_locations[0]).to.include({ index: 0, status: 'ok', mode: 'static' });
		});

		// /q/anything?page=dashboard reaches examplesite as /dashboard: no rest of the path, no query string
		expectPage('/q/anything?page=dashboard', 'this is the dashboard page');
	});

	it('Should keep a regex location whose forward path uses a capture', () => {
		cy.task('backendApiPut', {
			token: token,
			path:  `/api/nginx/proxy-hosts/${hostId}`,
			data:  {
				locations: [location('~ ^/cap/(.*)$', 'examplesite', { forward_path: '/$1' })],
			},
		}).then((data) => {
			cy.validateSwaggerSchema('put', 200, '/nginx/proxy-hosts/{hostID}', data);
			expect(data.meta.nginx_locations[0]).to.include({ index: 0, status: 'ok', mode: 'static' });
		});

		expectPage('/cap/dashboard', 'this is the dashboard page');
	});

	it('Should quarantine a location that uses an unknown variable, not the host', () => {
		cy.task('backendApiPut', {
			token: token,
			path:  `/api/nginx/proxy-hosts/${hostId}`,
			data:  {
				locations: [
					location('/dash', 'examplesite', { forward_path: '/dashboard' }),
					location('/typo', 'examplesite', { advanced_config: 'proxy_set_header X-Test $missing_variable;' }),
				],
			},
		}).then((data) => {
			cy.validateSwaggerSchema('put', 200, '/nginx/proxy-hosts/{hostID}', data);
			expect(data.meta).to.have.property('nginx_online', true);
			expect(data.meta.nginx_locations[0]).to.include({ index: 0, status: 'ok' });
			expect(data.meta.nginx_locations[1]).to.include({ index: 1, status: 'quarantined', mode: null });
			expect(data.meta.nginx_locations[1].message).to.contain('unknown variable "$missing_variable"');
		});

		expectPage('/dash', 'this is the dashboard page');
		expectStatus('/typo', '503');
	});

	it('Should delete the host', () => {
		cy.task('backendApiDelete', {
			token: token,
			path:  `/api/nginx/proxy-hosts/${hostId}`,
		}).then((data) => {
			expect(data).to.be.equal(true);
		});
	});
});
