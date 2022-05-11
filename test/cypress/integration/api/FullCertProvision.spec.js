/// <reference types="Cypress" />

describe('Full Certificate Provisions', () => {
	let token;
	let caID;
	let dnsID;

	before(() => {
		cy.getToken().then((tok) => {
			token = tok;

			cy.task('backendApiPost', {
				token: token,
				path:  '/api/certificate-authorities',
				data:  {
					name:                  'Test CA',
					acmesh_server:         'https://ca.internal/acme/acme/directory',
					ca_bundle:             '/etc/ssl/certs/NginxProxyManager.crt',
					max_domains:           5,
					is_wildcard_supported: true
				}
			}).then((data) => {
				// cy.validateSwaggerSchema('post', 201, '/certificate-authorities', data);
				expect(data.result).to.have.property('id');
				expect(data.result.id).to.be.greaterThan(0);
				caID = data.result.id;
			});

			cy.task('backendApiPost', {
				token: token,
				path:  '/api/dns-providers',
				data:  {
					acmesh_name:  'dns_pdns',
					name:         'PowerDNS - example.com',
					dns_sleep:    5,
					meta:         {
						url:       'http://ns1.pdns:8081',
						server_id: 'localhost',
						token:     'npm',
						ttl:       '5'
					}
				}
			}).then((data) => {
				cy.validateSwaggerSchema('post', 201, '/dns-providers', data);
				expect(data.result).to.have.property('id');
				expect(data.result.id).to.be.greaterThan(0);
				dnsID = data.result.id;
			});
		});
	});

	it('Should be able to create new http certificate', function() {
		cy.task('backendApiPost', {
			token: token,
			path:  '/api/certificates',
			data:  {
				type:                     'http',
				certificate_authority_id: caID,
				name:                     'website1.example.com',
				domain_names:             [
					'website1.example.com'
				]
			}
		}).then((data) => {
			cy.validateSwaggerSchema('post', 201, '/certificates', data);
			expect(data.result).to.have.property('id');
			expect(data.result.id).to.be.greaterThan(0);
			expect(data.result.user_id).to.be.greaterThan(0);
			cy.waitForCertificateStatus(token, data.result.id, 'provided');
		});
	});

	it('Should be able to create new dns certificate', function() {
		cy.task('backendApiPost', {
			token: token,
			path:  '/api/certificates',
			data:  {
				type:                     'dns',
				certificate_authority_id: caID,
				dns_provider_id:          dnsID,
				name:                     'dns: website2.example.com',
				domain_names:             [
					'website2.example.com'
				]
			}
		}).then((data) => {
			cy.validateSwaggerSchema('post', 201, '/certificates', data);
			expect(data.result).to.have.property('id');
			expect(data.result.id).to.be.greaterThan(0);
			expect(data.result.user_id).to.be.greaterThan(0);
			cy.waitForCertificateStatus(token, data.result.id, 'provided');
		});
	});

});
