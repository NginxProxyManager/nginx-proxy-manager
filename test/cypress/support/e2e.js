import "./commands.mjs";

import { register as registerCypressGrep } from "@cypress/grep";

registerCypressGrep();

Cypress.on("uncaught:exception", (/*err, runnable*/) => {
	// returning false here prevents Cypress from
	// failing the test
	return false;
});
