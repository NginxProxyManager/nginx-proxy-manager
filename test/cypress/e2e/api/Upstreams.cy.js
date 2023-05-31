/// <reference types="Cypress" />

describe('Upstream endpoints', () => {
	let token;
	let upstreamId;

	before(() => {
		cy.getToken().then((tok) => {
			token = tok;
		});
	});

	it('Should be able to create new Upstream', function() {
		cy.task('backendApiPost', {
			token: token,
			path:  '/api/upstreams',
			data:  {
				nginx_template_id: 5,
				name:              'CypressGeneratedUpstreamA',
				// These servers must be reachable by the Cypress CI stack!
				servers:           [
					{

						server: 'fullstack:80',
						weight: 100
					},
					{
						server: 'fullstack:443',
						weight: 50
					}
				]
			}
		}).then((data) => {
			// Check the swagger schema:
			cy.validateSwaggerSchema('post', 201, '/upstreams', data);
			expect(data.result).to.have.property('id');
			expect(data.result.id).to.be.greaterThan(0);
			upstreamId = data.result.id;
		});
	});

	it('Should be able to get a Upstream', function() {
		cy.task('backendApiGet', {
			token: token,
			path:  '/api/upstreams/' + upstreamId
		}).then((data) => {
			// Check the swagger schema:
			cy.validateSwaggerSchema('get', 200, '/upstreams/{upstreamID}', data);
			expect(data.result).to.have.property('id');
			expect(data.result).to.have.property('name', 'CypressGeneratedUpstreamA');
			expect(data.result.id).to.be.greaterThan(0);
		});
	});

	it('Should be able to get all Upstreams', function() {
		cy.task('backendApiGet', {
			token: token,
			path:  '/api/upstreams'
		}).then((data) => {
			cy.validateSwaggerSchema('get', 200, '/upstreams', data);
			expect(data).to.have.property('result');
			expect(data.result).to.have.property('items');
			expect(data.result.items.length).to.be.greaterThan(0);
		});
	});

});
