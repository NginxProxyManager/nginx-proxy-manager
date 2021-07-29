import React, { lazy, Suspense } from "react";

import { SiteWrapper, SuspenseLoader } from "components";
import {
	useAuthState,
	useLocaleState,
	useHealthState,
	UserProvider,
} from "context";
import { BrowserRouter, Switch, Route } from "react-router-dom";

const AccessLists = lazy(() => import("pages/AccessLists"));
const AuditLog = lazy(() => import("pages/AuditLog"));
const Certificates = lazy(() => import("pages/Certificates"));
const CertificateAuthorities = lazy(
	() => import("pages/CertificateAuthorities"),
);
const Dashboard = lazy(() => import("pages/Dashboard"));
const Hosts = lazy(() => import("pages/Hosts"));
const Login = lazy(() => import("pages/Login"));
const Settings = lazy(() => import("pages/Settings"));
const Setup = lazy(() => import("pages/Setup"));
const Users = lazy(() => import("pages/Users"));

function Router() {
	const { health } = useHealthState();
	const { authenticated } = useAuthState();
	const { locale } = useLocaleState();
	const Spinner = <SuspenseLoader />;

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
				<SiteWrapper key={`locale-${locale}`}>
					<Suspense fallback={Spinner}>
						<Switch>
							<Route path="/hosts">
								<Hosts />
							</Route>
							<Route path="/ssl/certificates">
								<Certificates />
							</Route>
							<Route path="/ssl/authorities">
								<CertificateAuthorities />
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
