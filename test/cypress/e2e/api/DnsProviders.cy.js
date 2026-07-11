/// <reference types="cypress" />

describe('DNS Providers endpoints', () => {
	let token;
	let providerID;
	let hostID;

	before(() => {
		cy.resetUsers();
		cy.getToken().then((tok) => {
			token = tok;
		});
	});

	it('Should be able to create a DNS Provider', () => {
		cy.task('backendApiPost', {
			token: token,
			path:  '/api/nginx/dns-providers',
			data:  {
				name:        'My Selectel DNS',
				type:        'selectel',
				credentials: {
					account_id:   '123456',
					project_name: 'default',
					username:     'api-user',
					password:     'secret'
				},
				default_ip: '203.0.113.10'
			}
		}).then((data) => {
			cy.validateSwaggerSchema('post', 201, '/nginx/dns-providers', data);
			expect(data).to.have.property('id');
			expect(data.id).to.be.greaterThan(0);
			// credentials are write-only and must never be echoed back:
			expect(data).to.not.have.property('credentials');
			providerID = data.id;
		});
	});

	it('Should be able to list DNS Providers', () => {
		cy.task('backendApiGet', {
			token: token,
			path:  '/api/nginx/dns-providers'
		}).then((data) => {
			cy.validateSwaggerSchema('get', 200, '/nginx/dns-providers', data);
			expect(data.length).to.be.greaterThan(0);

			const created = data.find((provider) => provider.id === providerID);
			expect(created).to.not.be.undefined;
			expect(created).to.not.have.property('credentials');
		});
	});

	it('Should test the DNS Provider connection gracefully', () => {
		cy.task('backendApiGet', {
			token: token,
			path:  `/api/nginx/dns-providers/${providerID}/test`
		}).then((data) => {
			cy.validateSwaggerSchema('get', 200, '/nginx/dns-providers/{providerID}/test', data);
			// Dummy credentials can't reach the real Selectel API from CI, so we assert
			// on the response shape rather than a hard-coded outcome - this proves the
			// endpoint responds gracefully instead of throwing a 500:
			expect(data).to.have.property('ok');
			expect(data.ok).to.be.a('boolean');
			if (!data.ok) {
				expect(data).to.have.property('error');
				expect(data.error).to.be.a('string');
			}
		});
	});

	it('Should be able to create a proxy host with a DNS Provider', () => {
		cy.task('backendApiPost', {
			token: token,
			path:  '/api/nginx/proxy-hosts',
			data:  {
				domain_names:    ['test-dns-provider.example.com'],
				forward_scheme:  'http',
				forward_host:    '1.1.1.1',
				forward_port:    80,
				access_list_id:  '0',
				certificate_id:  0,
				dns_provider_id: providerID,
				meta:            {
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
			// Host creation must not be blocked by DNS provider failures:
			expect(data).to.have.property('enabled', true);
			// Dummy Selectel creds can't reach the real API from CI, so internalDnsRecord.sync()
			// returns a graceful failure that must be merged into meta rather than thrown:
			expect(data).to.have.property('meta');
			expect(data.meta).to.have.property('dns_synced', false);
			expect(data.meta.dns_err).to.be.a('string');
			hostID = data.id;
		});
	});

	it('Should be able to delete the proxy host', () => {
		cy.task('backendApiDelete', {
			token: token,
			path:  `/api/nginx/proxy-hosts/${hostID}`
		}).then((data) => {
			cy.validateSwaggerSchema('delete', 200, '/nginx/proxy-hosts/{hostID}', data);
			expect(data).to.be.equal(true);
		});
	});

	it('Should be able to delete the DNS Provider', () => {
		cy.task('backendApiDelete', {
			token: token,
			path:  `/api/nginx/dns-providers/${providerID}`
		}).then((data) => {
			cy.validateSwaggerSchema('delete', 200, '/nginx/dns-providers/{providerID}', data);
			expect(data).to.be.equal(true);
		});
	});

});
