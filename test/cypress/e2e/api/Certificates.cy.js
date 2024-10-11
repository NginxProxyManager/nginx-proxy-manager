/// <reference types="Cypress" />

describe('Certificates endpoints', () => {
	let token;

	before(() => {
		cy.getToken().then((tok) => {
			token = tok;
		});
	});

	it('Validate custom certificate', function() {
		cy.task('backendApiPostFiles', {
			token: token,
			path:  '/api/nginx/certificates/validate',
			files:  {
				certificate: 'test.example.com.pem',
				certificate_key: 'test.example.com-key.pem',
			},
		}).then((data) => {
			cy.validateSwaggerSchema('post', 200, '/nginx/certificates/validate', data);
			expect(data).to.have.property('certificate');
			expect(data).to.have.property('certificate_key');
		});
	});

	it('Request Certificate - CVE-2024-46256/CVE-2024-46257', function() {
		cy.task('backendApiPost', {
			token: token,
			path:  '/api/nginx/certificates',
			data:  {
				domain_names: ['test.com"||echo hello-world||\\\\n test.com"'],
				meta:         {
					dns_challenge:     false,
					letsencrypt_agree: true,
					letsencrypt_email: 'admin@example.com',
				},
				provider: 'letsencrypt',
			},
			returnOnError: true,
		}).then((data) => {
			cy.validateSwaggerSchema('post', 400, '/nginx/certificates', data);
			expect(data).to.have.property('error');
			expect(data.error).to.have.property('message');
			expect(data.error).to.have.property('code');
			expect(data.error.code).to.equal(400);
			expect(data.error.message).to.contain('data/domain_names/0 must match pattern');
		});
	});
});
