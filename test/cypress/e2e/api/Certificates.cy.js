/// <reference types="cypress" />

describe('Certificates endpoints', () => {
	let token;
	let certID;

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

	it('Custom certificate lifecycle', function() {
		// Create custom cert
		cy.task('backendApiPost', {
			token: token,
			path:  '/api/nginx/certificates',
			data:  {
				provider: "other",
				nice_name: "Test Certificate",
			},
		}).then((data) => {
			cy.validateSwaggerSchema('post', 201, '/nginx/certificates', data);
			expect(data).to.have.property('id');
			certID = data.id;

			// Upload files
			cy.task('backendApiPostFiles', {
				token: token,
				path:  `/api/nginx/certificates/${certID}/upload`,
				files:  {
					certificate: 'test.example.com.pem',
					certificate_key: 'test.example.com-key.pem',
				},
			}).then((data) => {
				cy.validateSwaggerSchema('post', 200, '/nginx/certificates/{certID}/upload', data);
				expect(data).to.have.property('certificate');
				expect(data).to.have.property('certificate_key');

				// Get all certs
				cy.task('backendApiGet', {
					token: token,
					path:  '/api/nginx/certificates?expand=owner'
				}).then((data) => {
					cy.validateSwaggerSchema('get', 200, '/nginx/certificates', data);
					expect(data.length).to.be.greaterThan(0);

					// Delete cert
					cy.task('backendApiDelete', {
						token: token,
						path:  `/api/nginx/certificates/${certID}`
					}).then((data) => {
						cy.validateSwaggerSchema('delete', 200, '/nginx/certificates/{certID}', data);
						expect(data).to.be.equal(true);
					});
				});
			});
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
