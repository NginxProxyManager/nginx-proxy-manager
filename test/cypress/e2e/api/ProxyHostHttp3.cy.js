/// <reference types="cypress" />

/**
 * HTTP/3 (QUIC) lifecycle integration tests.
 *
 * These tests exercise the http3_support field through the full API stack:
 * create → verify field persists as expected → update to disable → verify → cleanup.
 *
 * The tests do NOT verify that QUIC sockets are actually established (that requires
 * a running nginx binary with --with-http_v3_module), they verify the data pipeline:
 * - The API accepts http3_support as a boolean payload
 * - The field round-trips correctly through the model and back out the response
 * - http3_support is coerced to 0 when no certificate is configured
 */
describe('HTTP/3 (QUIC) proxy host lifecycle', () => {
	let token;
	let createdHostId;

	before(() => {
		cy.resetUsers();
		cy.getToken().then((tok) => {
			token = tok;
		});
	});

	it('Should create a proxy host with http3_support=false (no cert) and store it correctly', () => {
		cy.task('backendApiPost', {
			token: token,
			path:  '/api/nginx/proxy-hosts',
			data:  {
				domain_names:            ['http3-test.example.com'],
				forward_scheme:          'http',
				forward_host:            '10.0.0.1',
				forward_port:            8080,
				access_list_id:          '0',
				certificate_id:          0,
				meta:                    { dns_challenge: false },
				advanced_config:         '',
				locations:               [],
				block_exploits:          false,
				caching_enabled:         false,
				allow_websocket_upgrade: false,
				http2_support:           false,
				http3_support:           true, // will be coerced to 0 by cleanSslHstsData (no cert)
				hsts_enabled:            false,
				hsts_subdomains:         false,
				ssl_forced:              false,
				trust_forwarded_proto:   false,
			}
		}).then((data) => {
			cy.validateSwaggerSchema('post', 201, '/nginx/proxy-hosts', data);
			expect(data).to.have.property('id');
			expect(data.id).to.be.greaterThan(0);
			expect(data).to.have.property('http3_support');
			// With certificate_id=0, cleanSslHstsData forces http3_support off
			expect(data.http3_support).to.equal(false);
			createdHostId = data.id;
		});
	});

	it('Should accept http3_support as an integer (0) and persist it correctly', () => {
		cy.task('backendApiPut', {
			token: token,
			path:  `/api/nginx/proxy-hosts/${createdHostId}`,
			data:  {
				domain_names:            ['http3-test.example.com'],
				forward_scheme:          'http',
				forward_host:            '10.0.0.1',
				forward_port:            8080,
				access_list_id:          '0',
				certificate_id:          0,
				meta:                    { dns_challenge: false },
				advanced_config:         '',
				locations:               [],
				block_exploits:          false,
				caching_enabled:         false,
				allow_websocket_upgrade: false,
				http2_support:           false,
				http3_support:           0, // integer form — the anyOf schema should accept this
				hsts_enabled:            false,
				hsts_subdomains:         false,
				ssl_forced:              false,
				trust_forwarded_proto:   false,
			}
		}).then((data) => {
			cy.validateSwaggerSchema('put', 200, '/nginx/proxy-hosts/{hostID}', data);
			expect(data).to.have.property('http3_support');
			expect(data.http3_support).to.equal(false);
		});
	});

	it('Should strip reuseport from advanced_config listen directives on update', () => {
		cy.task('backendApiPut', {
			token: token,
			path:  `/api/nginx/proxy-hosts/${createdHostId}`,
			data:  {
				domain_names:            ['http3-test.example.com'],
				forward_scheme:          'http',
				forward_host:            '10.0.0.1',
				forward_port:            8080,
				access_list_id:          '0',
				certificate_id:          0,
				meta:                    { dns_challenge: false },
				// User tries to inject reuseport manually into advanced_config
				advanced_config:         'listen 443 quic reuseport;',
				locations:               [],
				block_exploits:          false,
				caching_enabled:         false,
				allow_websocket_upgrade: false,
				http2_support:           false,
				http3_support:           false,
				hsts_enabled:            false,
				hsts_subdomains:         false,
				ssl_forced:              false,
				trust_forwarded_proto:   false,
			}
		}).then((data) => {
			cy.validateSwaggerSchema('put', 200, '/nginx/proxy-hosts/{hostID}', data);
			// reuseport must have been stripped from the advanced_config before persistence
			expect(data.advanced_config).to.not.include('reuseport');
			// The terminating semicolon must be preserved
			expect(data.advanced_config).to.include('listen 443 quic;');
		});
	});

	after(() => {
		// Clean up the test host
		if (createdHostId) {
			cy.task('backendApiDelete', {
				token: token,
				path:  `/api/nginx/proxy-hosts/${createdHostId}`,
			});
		}
	});
});
