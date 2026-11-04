/// <reference types="cypress" />

describe('Upstreams endpoints', () => {
	let token;
	const domain = 'upstreams.example.com';

	const createUser = (email, permissions) => {
		return cy.task('backendApiPost', {
			token: token,
			path:  '/api/users',
			data:  {
				name:     email,
				nickname: email.split('@')[0],
				email:    email,
				roles:    ['user'],
				auth:     {
					type:   'password',
					secret: 'changeme',
				},
			},
		}).then((user) => {
			return cy.task('backendApiPut', {
				token: token,
				path:  `/api/users/${user.id}/permissions`,
				data:  permissions,
			}).then(() => {
				return cy.getToken(null, {identity: email, secret: 'changeme'});
			});
		});
	};

	before(() => {
		cy.resetUsers();
		cy.getToken().then((tok) => {
			token = tok;

			// Gives the history provider something to report
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
			});
		});
	});

	it('Should list candidates with provider statuses and history items', () => {
		cy.task('backendApiGet', {
			token: token,
			path:  '/api/upstreams/candidates',
		}).then((data) => {
			cy.validateSwaggerSchema('get', 200, '/upstreams/candidates', data);
			expect(data).to.have.property('providers');
			expect(data.providers).to.have.property('docker');
			expect(data.providers).to.have.property('dns');
			expect(data.providers).to.have.property('history');
			// Docker discovery is opt-in: disabled in the default CI stack, ok or unavailable where it is turned on
			expect(['ok', 'disabled', 'unavailable']).to.include(data.providers.docker.status);
			if (data.providers.docker.status !== 'ok') {
				expect(data.providers.docker.message).to.be.a('string');
			}
			expect(data.providers.history.status).to.equal('ok');
			expect(['ok', 'unavailable', 'disabled']).to.include(data.providers.dns.status);
			expect(data).to.have.property('generated_at');

			const examplesite = data.items.find((item) => item.host === 'examplesite');
			expect(examplesite, 'examplesite candidate').to.not.be.undefined;
			// Found through Docker, on the network or from history; either way the port used before is known
			expect(['docker', 'dns', 'history']).to.include(examplesite.source);
			expect(examplesite.ports).to.include(80);
			expect(examplesite.used_by).to.be.greaterThan(0);
		});
	});

	it('Should refresh candidates', () => {
		cy.task('backendApiGet', {
			token: token,
			path:  '/api/upstreams/candidates?refresh=true',
		}).then((data) => {
			cy.validateSwaggerSchema('get', 200, '/upstreams/candidates', data);
			expect(data.items).to.be.an('array');
		});
	});

	it('Should check reachable and unknown targets', () => {
		cy.task('backendApiPost', {
			token: token,
			path:  '/api/upstreams/check',
			data:  {
				targets: [
					{host: 'examplesite', port: 80, scheme: 'http'},
					{host: 'nonexistent-upstream-host', port: 80, scheme: 'http'},
					{host: 'examplesite/some/path', port: 80},
					{host: 'bad host', port: 80},
				],
			},
		}).then((data) => {
			cy.validateSwaggerSchema('post', 200, '/upstreams/check', data);
			expect(data.results).to.have.length(4);

			const [ok, missing, withPath, invalid] = data.results;
			expect(ok.host).to.equal('examplesite');
			expect(ok.ok).to.equal(true);
			expect(ok.code).to.equal('ok');
			expect(ok.addresses.length).to.be.greaterThan(0);
			expect(ok.ms).to.be.a('number');

			expect(missing.ok).to.equal(false);
			expect(missing.code).to.equal('dns_not_found');
			expect(missing.message).to.be.a('string');

			expect(withPath.host).to.equal('examplesite/some/path');
			expect(withPath.code).to.equal('ok');

			expect(invalid.code).to.equal('invalid_host');
		});
	});

	it('Should reject invalid check payloads', () => {
		cy.task('backendApiPost', {
			token:         token,
			path:          '/api/upstreams/check',
			data:          {targets: [{host: 'examplesite', port: 70000}]},
			returnOnError: true,
		}).then((data) => {
			expect(data.error.code).to.equal(400);
		});

		cy.task('backendApiPost', {
			token:         token,
			path:          '/api/upstreams/check',
			data:          {targets: []},
			returnOnError: true,
		}).then((data) => {
			expect(data.error.code).to.equal(400);
		});
	});

	it('Should return the health monitor state', () => {
		cy.task('backendApiGet', {
			token: token,
			path:  '/api/upstreams/health',
		}).then((data) => {
			cy.validateSwaggerSchema('get', 200, '/upstreams/health', data);
			expect(data).to.have.property('enabled');
			expect(data).to.have.property('interval');
			expect(data).to.have.property('checked_at');
			expect(data.hosts).to.have.property('proxy_host');
			expect(data.hosts).to.have.property('stream');
		});
	});

	it('Should require authentication', () => {
		cy.task('backendApiGet', {
			path:          '/api/upstreams/candidates',
			returnOnError: true,
		}).then((data) => {
			expect(data.error.code).to.equal(403);
		});
	});

	it('Should enforce permissions', () => {
		// New users get 'manage' for every section and the permissions PUT only
		// patches what it is given, so set both sections that grant discovery.
		createUser('upstream-viewer@example.com', {proxy_hosts: 'view', streams: 'hidden'}).then((viewerToken) => {
			cy.task('backendApiGet', {
				token:         viewerToken,
				path:          '/api/upstreams/candidates',
				returnOnError: true,
			}).then((data) => {
				expect(data.error.code).to.equal(403);
			});

			cy.task('backendApiPost', {
				token:         viewerToken,
				path:          '/api/upstreams/check',
				data:          {targets: [{host: 'examplesite', port: 80}]},
				returnOnError: true,
			}).then((data) => {
				expect(data.error.code).to.equal(403);
			});

			// Viewing proxy hosts is enough for health; hosts of other owners are hidden
			cy.task('backendApiGet', {
				token: viewerToken,
				path:  '/api/upstreams/health',
			}).then((data) => {
				cy.validateSwaggerSchema('get', 200, '/upstreams/health', data);
				expect(Object.keys(data.hosts.proxy_host)).to.have.length(0);
			});
		});

		// Managing streams alone is enough for discovery
		createUser('upstream-streams@example.com', {proxy_hosts: 'hidden', streams: 'manage'}).then((streamsToken) => {
			cy.task('backendApiGet', {
				token: streamsToken,
				path:  '/api/upstreams/candidates',
			}).then((data) => {
				cy.validateSwaggerSchema('get', 200, '/upstreams/candidates', data);
				// The admin's proxy host is not visible to this user
				expect(data.items.filter((item) => item.source === 'history')).to.have.length(0);
			});

			cy.task('backendApiPost', {
				token: streamsToken,
				path:  '/api/upstreams/check',
				data:  {targets: [{host: 'examplesite', port: 80}]},
			}).then((data) => {
				cy.validateSwaggerSchema('post', 200, '/upstreams/check', data);
				expect(data.results).to.have.length(1);
			});
		});
	});

	it('Should rate limit candidate refreshes', () => {
		createUser('upstream-refresh@example.com', {proxy_hosts: 'manage'}).then((userToken) => {
			const statuses = [];
			const refresh = (remaining) => {
				if (remaining === 0) {
					return cy.wrap(statuses);
				}
				return cy.task('backendApiGet', {
					token:         userToken,
					path:          '/api/upstreams/candidates?refresh=true',
					returnOnError: true,
				}).then((data) => {
					statuses.push(data?.error ? data.error.code : 200);
					return refresh(remaining - 1);
				});
			};
			refresh(7).then((result) => {
				expect(result.slice(0, 6)).to.deep.equal([200, 200, 200, 200, 200, 200]);
				expect(result[6]).to.equal(429);
			});
		});
	});
});
