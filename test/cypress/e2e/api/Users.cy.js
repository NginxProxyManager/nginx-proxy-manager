/// <reference types="cypress" />

describe('Users endpoints', () => {
	let token;

	before(() => {
		cy.getToken().then((tok) => {
			token = tok;
		});
	});

	it('Should be able to get yourself', function() {
		cy.task('backendApiGet', {
			token: token,
			path:  '/api/users/me'
		}).then((data) => {
			cy.validateSwaggerSchema('get', 200, '/users/{userID}', data);
			expect(data).to.have.property('id');
			expect(data.id).to.be.greaterThan(0);
		});
	});

	it('Should be able to get all users', function() {
		cy.task('backendApiGet', {
			token: token,
			path:  '/api/users'
		}).then((data) => {
			cy.validateSwaggerSchema('get', 200, '/users', data);
			expect(data.length).to.be.greaterThan(0);
		});
	});

	it('Should be able to update yourself', function() {
		cy.task('backendApiPut', {
			token: token,
			path:  '/api/users/me',
			data:  {
				name: 'changed name'
			}
		}).then((data) => {
			cy.validateSwaggerSchema('put', 200, '/users/{userID}', data);
			expect(data).to.have.property('id');
			expect(data.id).to.be.greaterThan(0);
			expect(data.name).to.be.equal('changed name');
		});
	});

});
