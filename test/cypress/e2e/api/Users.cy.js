/// <reference types="cypress" />

describe('Users endpoints', () => {
	let token;

	before(() => {
		cy.resetUsers();
		cy.getToken().then((tok) => {
			token = tok;
		});
	});

	it('Should be able to get yourself', () => {
		cy.task('backendApiGet', {
			token: token,
			path:  '/api/users/me'
		}).then((data) => {
			cy.validateSwaggerSchema('get', 200, '/users/{userID}', data);
			expect(data).to.have.property('id');
			expect(data.id).to.be.greaterThan(0);
		});
	});

	it('Should be able to get all users', () => {
		cy.task('backendApiGet', {
			token: token,
			path:  '/api/users'
		}).then((data) => {
			cy.validateSwaggerSchema('get', 200, '/users', data);
			expect(data.length).to.be.greaterThan(0);
		});
	});

	it('Should reject a token that was issued before the password changed', () => {
		// The token carries whole seconds, so it has to predate the change by one.
		cy.wait(1100);

		cy.task('backendApiPut', {
			token: token,
			path:  '/api/users/me/auth',
			data:  {
				type:    'password',
				current: 'changeme',
				secret:  'changeme2'
			}
		}).then(() => {
			cy.task('backendApiGet', {
				token:         token,
				path:          '/api/users/me',
				returnOnError: true
			}).then((data) => {
				expect(data).to.have.property('error');
				expect(data.error).to.have.property('code');
				expect(data.error.code).to.equal(401);
			});

			// Put the password back, the rest of the suite shares this user, and take a
			// token minted after the change: restoring it invalidates the one that made it.
			cy.getToken(null, {secret: 'changeme2'}).then((tempToken) => {
				cy.task('backendApiPut', {
					token: tempToken,
					path:  '/api/users/me/auth',
					data:  {
						type:    'password',
						current: 'changeme2',
						secret:  'changeme'
					}
				}).then(() => {
					cy.getToken().then((freshToken) => {
						token = freshToken;
					});
				});
			});
		});
	});

	it('Should be able to update yourself', () => {
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
