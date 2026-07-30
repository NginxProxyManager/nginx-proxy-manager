/// <reference types="cypress" />

describe('Access Lists endpoints', () => {
	let token;
	let listId;

	before(() => {
		cy.resetUsers();
		cy.getToken().then((tok) => {
			token = tok;
		});
	});

	it('Should be able to create an access list with default_allow', () => {
		cy.task('backendApiPost', {
			token: token,
			path:  '/api/nginx/access-lists',
			data:  {
				name:          'Test Blocklist',
				satisfy_any:   true,
				pass_auth:     false,
				default_allow: true,
				items:         [],
				clients:       [
					{
						directive: 'deny',
						address:   '192.168.0.0/24'
					}
				]
			}
		}).then((data) => {
			cy.validateSwaggerSchema('post', 201, '/nginx/access-lists', data);
			expect(data).to.have.property('id');
			expect(data.id).to.be.greaterThan(0);
			expect(data).to.have.property('default_allow', true);
			listId = data.id;
		});
	});

	it('Should be able to update the default_allow flag', () => {
		cy.task('backendApiPut', {
			token: token,
			path:  `/api/nginx/access-lists/${listId}`,
			data:  {
				name:          'Test Blocklist',
				default_allow: false
			}
		}).then((data) => {
			cy.validateSwaggerSchema('put', 200, '/nginx/access-lists/{listID}', data);
			expect(data).to.have.property('id', listId);
			expect(data).to.have.property('default_allow', false);
		});
	});

	it('Should default to default_allow false when not given', () => {
		cy.task('backendApiPost', {
			token: token,
			path:  '/api/nginx/access-lists',
			data:  {
				name:    'Test Allowlist',
				items:   [],
				clients: [
					{
						directive: 'allow',
						address:   '10.0.0.0/8'
					}
				]
			}
		}).then((data) => {
			cy.validateSwaggerSchema('post', 201, '/nginx/access-lists', data);
			expect(data).to.have.property('default_allow', false);
		});
	});
});
