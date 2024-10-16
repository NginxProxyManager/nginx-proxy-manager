/// <reference types="cypress" />

describe('Full Certificate Provisions', () => {
	let token;

	before(() => {
		cy.getToken().then((tok) => {
			token = tok;
		});
	});

	it('Should be able to create new http certificate', function() {
		cy.task('backendApiPost', {
			token: token,
			path:  '/api/nginx/certificates',
			data:  {
				domain_names: [
					'website1.example.com'
				],
				meta: {
					letsencrypt_email: 'admin@example.com',
					letsencrypt_agree: true,
					dns_challenge: false
				},
				provider: 'letsencrypt'
			}
		}).then((data) => {
			cy.validateSwaggerSchema('post', 201, '/nginx/certificates', data);
			expect(data).to.have.property('id');
			expect(data.id).to.be.greaterThan(0);
			expect(data.provider).to.be.equal('letsencrypt');
		});
	});

	it('Should be able to create new DNS certificate with Powerdns', function() {
		cy.task('backendApiPost', {
			token: token,
			path:  '/api/nginx/certificates',
			data:  {
				domain_names: [
					'website2.example.com'
				],
				meta: {
					letsencrypt_email: "admin@example.com",
					dns_challenge: true,
					dns_provider: 'powerdns',
					dns_provider_credentials: 'dns_powerdns_api_url = http://ns1.pdns:8081\r\ndns_powerdns_api_key = npm',
					letsencrypt_agree: true,
					propagation_seconds: 5,
				},
				provider: 'letsencrypt'
			}
		}).then((data) => {
			cy.validateSwaggerSchema('post', 201, '/nginx/certificates', data);
			expect(data).to.have.property('id');
			expect(data.id).to.be.greaterThan(0);
			expect(data.provider).to.be.equal('letsencrypt');
			expect(data.meta.dns_provider).to.be.equal('powerdns');
		});
	});

});
