/// <reference types="cypress" />

describe('Certificates endpoints', () => {
	let token;
	let certID;

	before(() => {
		cy.resetUsers();
		cy.getToken().then((tok) => {
			token = tok;
		});
	});

	it('Should be able to create new certificate', function() {
		cy.task('backendApiPost', {
			token: token,
			path:  '/api/certificates',
			data:  {
				type:                     'http',
				certificate_authority_id: 1,
				name:                     'My First Cert',
				domain_names:             [
					'jc21.com',
					'*.google.com'
				]
			}
		}).then((data) => {
			// Check the swagger schema:
			cy.validateSwaggerSchema('post', 201, '/certificates', data);
			expect(data.result).to.have.property('id');
			expect(data.result.id).to.be.greaterThan(0);
			expect(data.result.user_id).to.be.greaterThan(0);
			certID = data.result.id;
		});
	});

	it('Should be able to get a certificate', function() {
		cy.task('backendApiGet', {
			token: token,
			path:  '/api/certificates/' + certID + '?expand=user'
		}).then((data) => {
			// Check the swagger schema:
			cy.validateSwaggerSchema('get', 200, '/certificates/{certificateID}', data);
			expect(data.result).to.have.property('id', certID);
			expect(data.result).to.have.property('user');
			expect(data.result.user).to.have.property('gravatar_url');
			expect(data.result.user.gravatar_url).to.include('gravatar.com');
		});
	});

	it('Should be able to update a certificate', function() {
		cy.task('backendApiPut', {
			token: token,
			path:  '/api/certificates/' + certID,
			data:  {
				name: 'My Updated Cert'
			}
		}).then((data) => {
			// Check the swagger schema:
			cy.validateSwaggerSchema('put', 200, '/certificates/{certificateID}', data);
			expect(data.result).to.have.property('id', certID);
			expect(data.result).to.have.property('name', 'My Updated Cert');
		});
	});

	it('Should be able to get all certificates', function() {
		cy.task('backendApiGet', {
			token: token,
			path:  '/api/certificates?expand=user'
		}).then((data) => {
			cy.validateSwaggerSchema('get', 200, '/certificates', data);
			expect(data).to.have.property('result');
			expect(data.result).to.have.property('items');
			expect(data.result.items.length).to.be.greaterThan(0);
			expect(data.result.items[0]).to.have.property('user');
			expect(data.result.items[0].user).to.have.property('gravatar_url');
			expect(data.result.items[0].user.gravatar_url).to.include('gravatar.com');
		});
	});

	it('Should be able to get all certificates with filters A', function() {
		cy.task('backendApiGet', {
			token: token,
			path:  '/api/certificates?sort=name&name:starts=my&limit=1'
		}).then((data) => {
			cy.validateSwaggerSchema('get', 200, '/certificates', data);
			expect(data).to.have.property('result');
			expect(data.result).to.have.property('items');
			expect(data.result.items.length).to.be.greaterThan(0);
		});
	});

	it('Should be able to get all certificates with filters B', function() {
		cy.task('backendApiGet', {
			token: token,
			path:  '/api/certificates?id:in=1,2,3,4,5&limit=1'
		}).then((data) => {
			cy.validateSwaggerSchema('get', 200, '/certificates', data);
			expect(data).to.have.property('result');
			expect(data.result).to.have.property('items');
			expect(data.result.items.length).to.eq(1);
		});
	});

	it('Should be able to get all certificates with filters C', function() {
		cy.task('backendApiGet', {
			token: token,
			path:  '/api/certificates?name:starts=xxxxxxxxxxxxxxx'
		}).then((data) => {
			cy.validateSwaggerSchema('get', 200, '/certificates', data);
			expect(data).to.have.property('result');
			expect(data.result).to.have.property('total', 0);
		});
	});

	it('Should be able to delete a certificate', function() {
		cy.task('backendApiDelete', {
			token: token,
			path:  '/api/certificates/' + certID
		}).then((data) => {
			cy.validateSwaggerSchema('delete', 200, '/certificates/{certificateID}', data);
			expect(data).to.have.property('result', true);
		});
	});

});
