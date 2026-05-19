/// <reference types="cypress" />

// Only tested once in the sqlite stack

describe('CertbotPlugins', () => {
	it('Should install all certbot plugins', () => {
		cy.env(['stack']).then(({ stack }) => {
			cy.log(`CertbotPlugins.cy.js - Running tests for stack: ${stack}`);
			if (stack === 'sqlite') {
				cy.task('backendApiGet', {
					path:  '/api/ci/certbot-plugins',
				}).then((data) => {
					expect(data).to.be.an('object');

					// Install each plugin
					for (const plugin of Object.keys(data)) {
						cy.log(`Installing plugin: ${plugin}`);
						cy.task('backendApiPost', {
							path: `/api/ci/certbot-plugins/${plugin}`,
						}).then((result) => {
							expect(result).to.be.true;
						});
					}
				});
			}
		});
	});
});
