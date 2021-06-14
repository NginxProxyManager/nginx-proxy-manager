import React from "react";

import Router from "components/Router";
import { AuthProvider, HealthProvider } from "context";

function App() {
	return (
		<HealthProvider>
			<AuthProvider>
				<Router />
			</AuthProvider>
		</HealthProvider>
	);
}

export default App;
