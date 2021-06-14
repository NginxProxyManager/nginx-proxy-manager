import React, { lazy, Suspense } from "react";

import { Loading, SiteWrapper, SinglePage } from "components";
import { useAuthState, useHealthState, UserProvider } from "context";
import { BrowserRouter, Switch, Route } from "react-router-dom";

const Setup = lazy(() => import("pages/Setup"));
const Dashboard = lazy(() => import("pages/Dashboard"));
const Login = lazy(() => import("pages/Login"));

function Router() {
	const { health } = useHealthState();
	const { authenticated } = useAuthState();
	const Spinner = (
		<SinglePage>
			<Loading />
		</SinglePage>
	);

	if (health.loading) {
		return Spinner;
	}

	if (health.healthy && !health.setup) {
		return (
			<Suspense fallback={Spinner}>
				<Setup />
			</Suspense>
		);
	}

	if (!authenticated) {
		return (
			<Suspense fallback={Spinner}>
				<Login />
			</Suspense>
		);
	}

	return (
		<UserProvider>
			<BrowserRouter>
				<SiteWrapper>
					<Suspense fallback={Spinner}>
						<Switch>
							<Route path="/">
								<Dashboard />
							</Route>
						</Switch>
					</Suspense>
				</SiteWrapper>
			</BrowserRouter>
		</UserProvider>
	);
}

export default Router;
