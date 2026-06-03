/// <reference types="cypress" />

/**
 * Optional integration test — requires Vault dev server:
 *   docker compose -f docker/docker-compose.dev.yml --profile vault up -d vault-dev
 *   export CYPRESS_VAULT_INTEGRATION=1
 */
const runVault = Cypress.env("VAULT_INTEGRATION") === true || Cypress.env("VAULT_INTEGRATION") === "1";

(runVault ? describe : describe.skip)("Vault provider integration", () => {
	let token;
	let providerId;

	before(() => {
		cy.resetUsers();
		cy.getToken().then((tok) => {
			token = tok;
		});
	});

	it("Creates vault provider pointing at dev Vault and tests OIDC path", () => {
		cy.task("backendApiPost", {
			token: token,
			path: "/api/credential-providers",
			data: {
				name: "Dev Vault",
				type: "vault",
				oidc_issuer: "https://issuer.example/oauth2",
				oidc_client_id: "npm",
				oidc_client_secret: "npm-dev-secret",
				meta: {
					address: "http://vault-dev:8200",
					mount: "secret",
					role: "npm",
				},
			},
		}).then((provider) => {
			providerId = provider.id;

			cy.task("backendApiPost", {
				token: token,
				path: `/api/credential-providers/${providerId}/test`,
				returnOnError: true,
			}).then((result) => {
				expect(result).to.exist;
			});
		});
	});

	after(() => {
		if (providerId) {
			cy.task("backendApiDelete", {
				token: token,
				path: `/api/credential-providers/${providerId}`,
			});
		}
	});
});
