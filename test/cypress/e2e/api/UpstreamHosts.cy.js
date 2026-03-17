/// <reference types="cypress" />

describe('Upstream Hosts endpoints', () => {
	let token;
	let upstreamHostId;

	before(() => {
		cy.getToken().then((tok) => {
			token = tok;
		});
	});

	it('Should be able to create a round-robin upstream host', () => {
		cy.task('backendApiPost', {
			token: token,
			path:  '/api/nginx/upstream-hosts',
			data:  {
				name:           'Test Upstream RR',
				forward_scheme: 'http',
				method:         'round_robin',
				servers: [
					{ host: '10.0.0.1', port: 8080, weight: 1 },
					{ host: '10.0.0.2', port: 8080, weight: 1 },
				],
				meta: {},
			}
		}).then((data) => {
			cy.validateSwaggerSchema('post', 201, '/nginx/upstream-hosts', data);
			expect(data).to.have.property('id');
			expect(data.id).to.be.greaterThan(0);
			expect(data).to.have.property('name', 'Test Upstream RR');
			expect(data).to.have.property('forward_scheme', 'http');
			expect(data).to.have.property('method', 'round_robin');
			expect(data).to.have.property('servers');
			expect(data.servers).to.have.length(2);
			expect(data.servers[0]).to.have.property('host', '10.0.0.1');
			expect(data.servers[0]).to.have.property('port', 8080);
			upstreamHostId = data.id;
		});
	});

	it('Should be able to create a least-conn upstream host', () => {
		cy.task('backendApiPost', {
			token: token,
			path:  '/api/nginx/upstream-hosts',
			data:  {
				name:           'Test Upstream LC',
				forward_scheme: 'https',
				method:         'least_conn',
				servers: [
					{ host: '10.0.0.3', port: 443, weight: 5 },
					{ host: '10.0.0.4', port: 443, weight: 10 },
				],
				meta: {},
			}
		}).then((data) => {
			cy.validateSwaggerSchema('post', 201, '/nginx/upstream-hosts', data);
			expect(data).to.have.property('id');
			expect(data.id).to.be.greaterThan(0);
			expect(data).to.have.property('method', 'least_conn');
			expect(data).to.have.property('forward_scheme', 'https');
			expect(data.servers[0]).to.have.property('weight', 5);
			expect(data.servers[1]).to.have.property('weight', 10);
		});
	});

	it('Should be able to create an ip-hash upstream host', () => {
		cy.task('backendApiPost', {
			token: token,
			path:  '/api/nginx/upstream-hosts',
			data:  {
				name:           'Test Upstream IH',
				forward_scheme: 'http',
				method:         'ip_hash',
				servers: [
					{ host: '10.0.0.5', port: 9000 },
				],
				meta: {},
			}
		}).then((data) => {
			cy.validateSwaggerSchema('post', 201, '/nginx/upstream-hosts', data);
			expect(data).to.have.property('method', 'ip_hash');
			expect(data.servers).to.have.length(1);
		});
	});

	it('Should be able to list all upstream hosts', () => {
		cy.task('backendApiGet', {
			token: token,
			path:  '/api/nginx/upstream-hosts',
		}).then((data) => {
			cy.validateSwaggerSchema('get', 200, '/nginx/upstream-hosts', data);
			expect(data).to.be.an('array');
			expect(data.length).to.be.greaterThan(0);
		});
	});

	it('Should be able to get a specific upstream host', () => {
		cy.task('backendApiGet', {
			token: token,
			path:  '/api/nginx/upstream-hosts/' + upstreamHostId,
		}).then((data) => {
			cy.validateSwaggerSchema('get', 200, '/nginx/upstream-hosts/{upstreamID}', data);
			expect(data).to.have.property('id', upstreamHostId);
			expect(data).to.have.property('name', 'Test Upstream RR');
		});
	});

	it('Should be able to update an upstream host', () => {
		cy.task('backendApiPut', {
			token: token,
			path:  '/api/nginx/upstream-hosts/' + upstreamHostId,
			data:  {
				name:           'Updated Upstream',
				forward_scheme: 'https',
				method:         'least_conn',
				servers: [
					{ host: '10.0.0.1', port: 8080, weight: 3 },
					{ host: '10.0.0.2', port: 8080, weight: 7 },
					{ host: '10.0.0.9', port: 8080, weight: 5 },
				],
				meta: {},
			}
		}).then((data) => {
			cy.validateSwaggerSchema('put', 200, '/nginx/upstream-hosts/{upstreamID}', data);
			expect(data).to.have.property('id', upstreamHostId);
			expect(data).to.have.property('name', 'Updated Upstream');
			expect(data).to.have.property('forward_scheme', 'https');
			expect(data).to.have.property('method', 'least_conn');
			expect(data.servers).to.have.length(3);
		});
	});

	it('Should be able to delete an unused upstream host', () => {
		cy.task('backendApiPost', {
			token: token,
			path:  '/api/nginx/upstream-hosts',
			data:  {
				name:           'To Delete',
				forward_scheme: 'http',
				method:         'round_robin',
				servers: [
					{ host: '10.0.0.99', port: 80 },
				],
				meta: {},
			}
		}).then((created) => {
			cy.task('backendApiDelete', {
				token: token,
				path:  '/api/nginx/upstream-hosts/' + created.id,
			}).then((data) => {
				expect(data).to.be.equal(true);
			});
		});
	});
});

describe('Proxy Hosts with Upstream Hosts', () => {
	let token;
	let upstreamHostId;
	let proxyHostId;

	before(() => {
		cy.getToken().then((tok) => {
			token = tok;
			cy.task('backendApiPost', {
				token: token,
				path:  '/api/nginx/upstream-hosts',
				data:  {
					name:           'Proxy Test Upstream',
					forward_scheme: 'http',
					method:         'round_robin',
					servers: [
						{ host: '10.0.0.50', port: 8080, weight: 1 },
						{ host: '10.0.0.51', port: 8080, weight: 1 },
					],
					meta: {},
				}
			}).then((data) => {
				upstreamHostId = data.id;
			});
		});
	});

	it('Should create a proxy host using an upstream host', () => {
		cy.task('backendApiPost', {
			token: token,
			path:  '/api/nginx/proxy-hosts',
			data:  {
				domain_names:            ['upstream-test.example.com'],
				forward_scheme:          'http',
				forward_host:            '127.0.0.1',
				forward_port:            80,
				upstream_host_id:        upstreamHostId,
				access_list_id:          '0',
				certificate_id:          0,
				meta:                    {},
				advanced_config:         '',
				locations:               [],
				block_exploits:          false,
				caching_enabled:         false,
				allow_websocket_upgrade: false,
				http2_support:           false,
				hsts_enabled:            false,
				hsts_subdomains:         false,
				ssl_forced:              false,
			}
		}).then((data) => {
			cy.validateSwaggerSchema('post', 201, '/nginx/proxy-hosts', data);
			expect(data).to.have.property('id');
			expect(data.id).to.be.greaterThan(0);
			expect(data).to.have.property('upstream_host_id', upstreamHostId);
			proxyHostId = data.id;
		});
	});

	it('Should get proxy host with upstream host expanded', () => {
		cy.task('backendApiGet', {
			token: token,
			path:  '/api/nginx/proxy-hosts/' + proxyHostId + '?expand=upstream_host',
		}).then((data) => {
			expect(data).to.have.property('id', proxyHostId);
			expect(data).to.have.property('upstream_host_id', upstreamHostId);
		});
	});

	it('Should switch proxy host from upstream to direct', () => {
		cy.task('backendApiPut', {
			token: token,
			path:  '/api/nginx/proxy-hosts/' + proxyHostId,
			data:  {
				upstream_host_id: 0,
				forward_host:    '192.168.1.100',
				forward_port:    3000,
			}
		}).then((data) => {
			cy.validateSwaggerSchema('put', 200, '/nginx/proxy-hosts/{hostID}', data);
			expect(data).to.have.property('upstream_host_id', 0);
			expect(data).to.have.property('forward_host', '192.168.1.100');
			expect(data).to.have.property('forward_port', 3000);
		});
	});

	it('Should switch proxy host from direct back to upstream', () => {
		cy.task('backendApiPut', {
			token: token,
			path:  '/api/nginx/proxy-hosts/' + proxyHostId,
			data:  {
				upstream_host_id: upstreamHostId,
			}
		}).then((data) => {
			cy.validateSwaggerSchema('put', 200, '/nginx/proxy-hosts/{hostID}', data);
			expect(data).to.have.property('upstream_host_id', upstreamHostId);
		});
	});

	it('Should not be able to delete upstream host that is in use', () => {
		cy.task('backendApiDelete', {
			token: token,
			path:  '/api/nginx/upstream-hosts/' + upstreamHostId,
			returnOnError: true,
		}).then((data) => {
			expect(data).to.have.property('error');
		});
	});
});

describe('Custom Locations with Upstream Hosts', () => {
	let token;
	let upstreamHostId;

	before(() => {
		cy.getToken().then((tok) => {
			token = tok;
			cy.task('backendApiPost', {
				token: token,
				path:  '/api/nginx/upstream-hosts',
				data:  {
					name:           'Location Test Upstream',
					forward_scheme: 'http',
					method:         'round_robin',
					servers: [
						{ host: '10.0.0.60', port: 9090, weight: 1 },
						{ host: '10.0.0.61', port: 9090, weight: 2 },
					],
					meta: {},
				}
			}).then((data) => {
				upstreamHostId = data.id;
			});
		});
	});

	it('Should create a proxy host with a location using upstream host', () => {
		cy.task('backendApiPost', {
			token: token,
			path:  '/api/nginx/proxy-hosts',
			data:  {
				domain_names:            ['location-upstream.example.com'],
				forward_scheme:          'http',
				forward_host:            '127.0.0.1',
				forward_port:            80,
				access_list_id:          '0',
				certificate_id:          0,
				meta:                    {},
				advanced_config:         '',
				locations: [
					{
						path:                         '/api',
						forward_scheme:               'http',
						forward_host:                 '127.0.0.1',
						forward_port:                 80,
						upstream_host_id:             upstreamHostId,
						upstream_host_forward_scheme: 'http',
					}
				],
				block_exploits:          false,
				caching_enabled:         false,
				allow_websocket_upgrade: false,
				http2_support:           false,
				hsts_enabled:            false,
				hsts_subdomains:         false,
				ssl_forced:              false,
			}
		}).then((data) => {
			cy.validateSwaggerSchema('post', 201, '/nginx/proxy-hosts', data);
			expect(data).to.have.property('id');
			expect(data).to.have.property('locations');
			expect(data.locations).to.have.length(1);
			expect(data.locations[0]).to.have.property('path', '/api');
			expect(data.locations[0]).to.have.property('upstream_host_id', upstreamHostId);
		});
	});

	it('Should create a proxy host with mixed locations (direct + upstream)', () => {
		cy.task('backendApiPost', {
			token: token,
			path:  '/api/nginx/proxy-hosts',
			data:  {
				domain_names:            ['mixed-locations.example.com'],
				forward_scheme:          'http',
				forward_host:            '127.0.0.1',
				forward_port:            80,
				access_list_id:          '0',
				certificate_id:          0,
				meta:                    {},
				advanced_config:         '',
				locations: [
					{
						path:           '/api',
						forward_scheme: 'http',
						forward_host:   '10.0.0.70',
						forward_port:   3000,
					},
					{
						path:                         '/ws',
						forward_scheme:               'http',
						forward_host:                 '127.0.0.1',
						forward_port:                 80,
						upstream_host_id:             upstreamHostId,
						upstream_host_forward_scheme: 'http',
					}
				],
				block_exploits:          false,
				caching_enabled:         false,
				allow_websocket_upgrade: false,
				http2_support:           false,
				hsts_enabled:            false,
				hsts_subdomains:         false,
				ssl_forced:              false,
			}
		}).then((data) => {
			cy.validateSwaggerSchema('post', 201, '/nginx/proxy-hosts', data);
			expect(data.locations).to.have.length(2);
			expect(data.locations[0]).to.have.property('path', '/api');
			expect(data.locations[0]).to.have.property('forward_host', '10.0.0.70');
			expect(data.locations[1]).to.have.property('path', '/ws');
			expect(data.locations[1]).to.have.property('upstream_host_id', upstreamHostId);
		});
	});
});
