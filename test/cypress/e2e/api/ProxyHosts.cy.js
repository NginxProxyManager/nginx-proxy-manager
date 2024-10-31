/// <reference types="cypress" />

describe('Proxy Hosts endpoints', () => {
	let token;

	before(() => {
		cy.getToken().then((tok) => {
			token = tok;
		});
	});

	it('Should be able to create a http host', function() {
		cy.task('backendApiPost', {
			token: token,
			path:  '/api/nginx/proxy-hosts',
			data:  {
				// Use current timestamp (in ms) to generate unique hosts and
				// not have failing tests on second run without clearing db
				domain_names:   [`test-${Date.now()}.example.com`],
				forward_scheme: 'http',
				forward_host:   '1.1.1.1',
				forward_port:   80,
				access_list_id: '0',
				certificate_id: 0,
				meta:           {
					letsencrypt_agree: false,
					dns_challenge:     false
				},
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
			expect(data).to.have.property('enabled');
			expect(data).to.have.property("enabled", true);
			expect(data).to.have.property('meta');
			expect(typeof data.meta.nginx_online).to.be.equal('undefined');
		});
	});

	it('Should be able to get a http host', function() {
		cy.task('backendApiGet', {
			token: token,
			path:  '/api/nginx/proxy-hosts',
		}).then((data) => {
			cy.validateSwaggerSchema('get', 200, '/nginx/proxy-hosts', data);
			expect(data.length).to.be.greaterThan(0);
			let hostId = data[0].id;
			expect(hostId).to.be.greaterThan(0);
			cy.task('backendApiGet', {
				token: token,
				path: `/api/nginx/proxy-hosts/${hostId}`,
			}).then((data) => {
				cy.validateSwaggerSchema('get', 200, '/nginx/proxy-hosts/{hostID}', data);
			});
		});
	});

	it('Should be able to update a http host', function() {
		cy.task('backendApiGet', {
			token: token,
			path:  '/api/nginx/proxy-hosts',
		}).then((data) => {
			cy.validateSwaggerSchema('get', 200, '/nginx/proxy-hosts', data);
			expect(data.length).to.be.greaterThan(0);
			let hostId = data[0].id;
			expect(hostId).to.be.greaterThan(0);
			cy.task('backendApiPut', {
				token: token,
				path: `/api/nginx/proxy-hosts/${hostId}`,
				data: {
					domain_names:   [`test-${Date.now()}.example.com`],
					forward_scheme: 'http',
					forward_host:   '1.1.1.1',
					forward_port:   80,
					access_list_id: '0',
					certificate_id: 0,
					meta:           {
						letsencrypt_agree: false,
						dns_challenge:     false
					},
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
				cy.validateSwaggerSchema('put', 200, '/nginx/proxy-hosts/{hostID}', data);
				expect(data).to.have.property('id');
				expect(data.id).to.be.greaterThan(0);
				expect(data).to.have.property('enabled');
				expect(data).to.have.property("enabled", true);
				expect(data).to.have.property('meta');
				expect(data.meta.nginx_online).to.be.true;
			});
		});
	});

	it('Should be able to disable and enable a http host', function() {
		cy.task('backendApiGet', {
			token: token,
			path:  '/api/nginx/proxy-hosts',
		}).then((data) => {
			cy.validateSwaggerSchema('get', 200, '/nginx/proxy-hosts', data);
			expect(data.length).to.be.greaterThan(0);
			let hostId = data[0].id;
			expect(hostId).to.be.greaterThan(0);
			cy.task('backendApiPost', {
				token: token,
				path: `/api/nginx/proxy-hosts/${hostId}/disable`,
			}).then((data) => {
				cy.validateSwaggerSchema('post', 200, '/nginx/proxy-hosts/{hostID}/disable', data);
				expect(data).to.be.true;

				cy.task('backendApiPost', {
					token: token,
					path: `/api/nginx/proxy-hosts/${hostId}/enable`,
				}).then((data) => {
					cy.validateSwaggerSchema('post', 200, '/nginx/proxy-hosts/{hostID}/enable', data);
					expect(data).to.be.true;
				});
			});
		});
	});

	it('Should be able to delete a http host', function() {
		cy.task('backendApiGet', {
			token: token,
			path:  '/api/nginx/proxy-hosts',
		}).then((data) => {
			cy.validateSwaggerSchema('get', 200, '/nginx/proxy-hosts', data);
			expect(data.length).to.be.greaterThan(0);
			let hostId = data[0].id;
			expect(hostId).to.be.greaterThan(0);
			cy.task('backendApiDelete', {
				token: token,
				path: `/api/nginx/proxy-hosts/${hostId}`
			}).then((data) => {
				cy.validateSwaggerSchema('delete', 200, '/nginx/proxy-hosts/{hostID}', data);
				expect(data).to.be.true;
			});
		});
	});
});
