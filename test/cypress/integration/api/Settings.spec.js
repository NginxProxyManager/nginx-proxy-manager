/// <reference types="Cypress" />

const generateRandomString = function (length) {
	var result           = '';
	var characters       = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	var charactersLength = characters.length;
	for (var i = 0; i < length; i++) {
		result += characters.charAt(Math.floor(Math.random() * charactersLength));
	}
	return result;
};

describe('Settings endpoints', () => {
	let token;
	let settingName = 'cypressSetting_' + generateRandomString(12);

	before(() => {
		cy.getToken().then((tok) => {
			token = tok;
		});
	});

	it('Should be able to create new settting', function() {
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

	it('Should be able to get a settting', function() {
		cy.task('backendApiGet', {
			token: token,
			path:  '/api/settings/' + settingName
		}).then((data) => {
			// Check the swagger schema:
			cy.validateSwaggerSchema('get', 200, '/settings/{name}', data);
			expect(data.result).to.have.property('id');
			expect(data.result).to.have.property('name', settingName);
			expect(data.result.id).to.be.greaterThan(0);
		});
	});

	it('Should be able to update a settting', function() {
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
			expect(data.result).to.have.property('name', settingName);
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
			path:  '/api/settings?sort=name&name:starts=e&limit=1'
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
			path:  '/api/settings?id:in=1,2,3,4,5&limit=1'
		}).then((data) => {
			cy.validateSwaggerSchema('get', 200, '/settings', data);
			expect(data).to.have.property('result');
			expect(data.result).to.have.property('items');
			expect(data.result.items.length).to.be.greaterThan(0);
		});
	});

	it('Should be able to get all settings with filters C', function() {
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
