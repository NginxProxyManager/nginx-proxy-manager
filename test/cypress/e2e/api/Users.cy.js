/// <reference types="cypress" />

describe('Users endpoints', () => {
	let token;
	let uniqueEmail;
	let myUserID = 0;

	before(() => {
		cy.resetUsers();
		cy.getToken().then((tok) => {
			token = tok;
		});
		cy.randomString(10).then((str) => {
			uniqueEmail = 'jc_' + str + '@example.com';
			uniqueEmail = uniqueEmail.trim();
		});
	});

	it('Should be able to get yourself', function() {
		cy.task('backendApiGet', {
			token: token,
			path:  '/api/users/me'
		}).then((data) => {
			cy.validateSwaggerSchema('get', 200, '/users/{userID}', data);
			expect(data).to.have.property('result');
			expect(data.result).to.have.property('id');
			expect(data.result.id).to.be.greaterThan(0);
			myUserID = data.result.id;
		});
	});

	it('Should be able to get all users', function() {
		cy.task('backendApiGet', {
			token: token,
			path:  '/api/users'
		}).then((data) => {
			cy.validateSwaggerSchema('get', 200, '/users', data);
			expect(data).to.have.property('result');
			expect(data.result).to.have.property('items');
			expect(data.result.items.length).to.be.greaterThan(0);
		});
	});

	it('Should be able to get all users with filters A', function() {
		cy.task('backendApiGet', {
			token: token,
			path:  '/api/users?sort=created_at.desc&name:starts=c&name:ends=e'
		}).then((data) => {
			cy.validateSwaggerSchema('get', 200, '/users', data);
			expect(data).to.have.property('result');
			expect(data.result).to.have.property('items');
			expect(data.result.items.length).to.be.greaterThan(0);
		});
	});

	it('Should be able to get all users with filters B', function() {
		cy.task('backendApiGet', {
			token: token,
			path:  '/api/users?sort=created_at&id:in=1,2,3,4,5'
		}).then((data) => {
			cy.validateSwaggerSchema('get', 200, '/users', data);
			expect(data).to.have.property('result');
			expect(data.result).to.have.property('items');
			expect(data.result.items.length).to.be.greaterThan(0);
		});
	});

	it('Should be able to get all users with filters C', function() {
		cy.task('backendApiGet', {
			token: token,
			path:  '/api/users?sort=name.asc&name:ends=xxxxxxxxxxxxx'
		}).then((data) => {
			cy.validateSwaggerSchema('get', 200, '/users', data);
			expect(data).to.have.property('result');
			expect(data.result).to.have.property('total', 0);
		});
	});

	it('Should be able to create someone else', function() {
		cy.task('backendApiPost', {
			token: token,
			path:  '/api/users',
			data:  {
				name:        'Example user 1',
				email:       uniqueEmail,
				is_disabled: false,
				auth:        {
					type:   'local',
					secret: 'changeme'
				},
				capabilities: [
					'hosts.manage'
				]
			}
		}).then((data) => {
			cy.validateSwaggerSchema('post', 201, '/users', data);
			expect(data).to.have.property('result');
			expect(data.result).to.have.property('id');
			expect(data.result.id).to.be.greaterThan(0);
		});
	});

	it('Should not be able to create duplicate email', function() {
		cy.task('backendApiPost', {
			token:         token,
			path:          '/api/users',
			returnOnError: true,
			data:          {
				name:        'Example user 2',
				email:       uniqueEmail,
				is_disabled: false,
				auth:        {
					type:   'local',
					secret: 'changeme'
				},
				capabilities: [
					'hosts.manage'
				]
			}
		}).then((data) => {
			cy.validateSwaggerSchema('post', 400, '/users', data);
			expect(data).to.have.property('result', null);
			expect(data).to.have.property('error');
			expect(data.error).to.have.property('code', 400);
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
			expect(data).to.have.property('result');
			expect(data.result).to.have.property('id');
			expect(data.result.id).to.be.greaterThan(0);
			expect(data.result.name).to.be.equal('changed name');
		});
	});

	it('Should not be able to update email to another user', function() {
		cy.task('backendApiPut', {
			token:         token,
			path:          '/api/users/me',
			returnOnError: true,
			data:          {
				email: uniqueEmail
			}
		}).then((data) => {
			cy.validateSwaggerSchema('put', 400, '/users/{userID}', data);
			expect(data).to.have.property('result', null);
			expect(data).to.have.property('error');
			expect(data.error).to.have.property('code', 400);
		});
	});

	it('Should not be able to disable yourself', function() {
		cy.task('backendApiPut', {
			token:         token,
			path:          '/api/users/me',
			returnOnError: true,
			data:          {
				is_disabled: true
			}
		}).then((data) => {
			cy.validateSwaggerSchema('put', 400, '/users/{userID}', data);
			expect(data).to.have.property('result', null);
			expect(data).to.have.property('error');
			expect(data.error).to.have.property('code', 400);
		});
	});

	it('Should not be able to delete yourself', function() {
		cy.task('backendApiDelete', {
			token:         token,
			path:          '/api/users/' + myUserID,
			returnOnError: true
		}).then((data) => {
			cy.validateSwaggerSchema('delete', 400, '/users/{userID}', data);
			expect(data).to.have.property('result', null);
			expect(data).to.have.property('error');
			expect(data.error).to.have.property('code', 400);
		});
	});

});
