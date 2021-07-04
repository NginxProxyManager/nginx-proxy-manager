import React, { lazy, Suspense } from "react";

import { Loading, SiteWrapper, SinglePage } from "components";
import { useAuthState, useHealthState, UserProvider } from "context";
import { BrowserRouter, Switch, Route } from "react-router-dom";

const AccessLists = lazy(() => import("pages/AccessLists"));
const AuditLog = lazy(() => import("pages/AuditLog"));
const Certificates = lazy(() => import("pages/Certificates"));
const Dashboard = lazy(() => import("pages/Dashboard"));
const Hosts = lazy(() => import("pages/Hosts"));
const Login = lazy(() => import("pages/Login"));
const Settings = lazy(() => import("pages/Settings"));
const Setup = lazy(() => import("pages/Setup"));
const Users = lazy(() => import("pages/Users"));

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
							<Route path="/hosts">
								<Hosts />
							</Route>
							<Route path="/certificates">
								<Certificates />
							</Route>
							<Route path="/audit-log">
								<AuditLog />
							</Route>
							<Route path="/access-lists">
								<AccessLists />
							</Route>
							<Route path="/users">
								<Users />
							</Route>
							<Route path="/settings">
								<Settings />
							</Route>
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
