/// <reference types="Cypress" />

// Settings are stored lowercase in the backend

describe('Settings endpoints', () => {
	let token;
	let settingName;

	before(() => {
		cy.resetUsers();
		cy.getToken().then((tok) => {
			token = tok;
		});
		cy.randomString(12).then((str) => {
			settingName = 'cypressSetting_' + str;
			settingName = settingName.trim();
		});
	});

	it('Should be able to create new setting', function() {
		cy.task('backendApiPost', {
			token: token,
			path:  '/api/settings',
			data:  {
				name:  settingName,
				value: {
					type: 'custom',
					html: '<p>not found</p>'
				}
			}
		}).then((data) => {
			// Check the swagger schema:
			cy.validateSwaggerSchema('post', 201, '/settings', data);
			expect(data.result).to.have.property('id');
			expect(data.result.id).to.be.greaterThan(0);
		});
	});

	it('Should be able to get a setting', function() {
		cy.task('backendApiGet', {
			token: token,
			path:  '/api/settings/' + settingName
		}).then((data) => {
			// Check the swagger schema:
			cy.validateSwaggerSchema('get', 200, '/settings/{name}', data);
			expect(data.result).to.have.property('id');
			expect(data.result).to.have.property('name', settingName.toLowerCase());
			expect(data.result.id).to.be.greaterThan(0);
		});
	});

	it('Should be able to update a setting', function() {
		cy.task('backendApiPut', {
			token: token,
			path:  '/api/settings/' + settingName,
			data:  {
				value: true
			}
		}).then((data) => {
			// Check the swagger schema:
			cy.validateSwaggerSchema('put', 200, '/settings/{name}', data);
			expect(data.result).to.have.property('id');
			expect(data.result).to.have.property('name', settingName.toLowerCase());
			expect(data.result.id).to.be.greaterThan(0);
		});
	});

	it('Should be able to get all settings', function() {
		cy.task('backendApiGet', {
			token: token,
			path:  '/api/settings'
		}).then((data) => {
			cy.validateSwaggerSchema('get', 200, '/settings', data);
			expect(data).to.have.property('result');
			expect(data.result).to.have.property('items');
			expect(data.result.items.length).to.be.greaterThan(0);
		});
	});

	it('Should be able to get all settings with filters A', function() {
		cy.task('backendApiGet', {
			token: token,
			path:  '/api/settings?id:in=1,2,3,4,5&limit=1'
		}).then((data) => {
			cy.validateSwaggerSchema('get', 200, '/settings', data);
			expect(data).to.have.property('result');
			expect(data.result).to.have.property('items');
			expect(data.result.items.length).to.be.greaterThan(0);
		});
	});

	it('Should be able to get all settings with filters B', function() {
		cy.task('backendApiGet', {
			token: token,
			path:  '/api/settings?name:starts=xxxxxxxxxxxxxxx'
		}).then((data) => {
			cy.validateSwaggerSchema('get', 200, '/settings', data);
			expect(data).to.have.property('result');
			expect(data.result).to.have.property('total', 0);
		});
	});

});
