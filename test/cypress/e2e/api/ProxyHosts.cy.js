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
				domain_names:   ['test.example.com'],
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
				ssl_forced:              false
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

});
