import { lazy, Suspense } from "react";

import { SiteWrapper, SpinnerPage, Unhealthy } from "components";
import { useAuthState, useLocaleState } from "context";
import { useHealth } from "hooks";
import { BrowserRouter, Routes, Route } from "react-router-dom";

const AccessLists = lazy(() => import("pages/AccessLists"));
const AuditLog = lazy(() => import("pages/AuditLog"));
const Certificates = lazy(() => import("pages/Certificates"));
const CertificateAuthorities = lazy(
	() => import("pages/CertificateAuthorities"),
);
const Dashboard = lazy(() => import("pages/Dashboard"));
const DNSProviders = lazy(() => import("pages/DNSProviders"));
const Hosts = lazy(() => import("pages/Hosts"));
const NginxTemplates = lazy(() => import("pages/NginxTemplates"));
const Login = lazy(() => import("pages/Login"));
const GeneralSettings = lazy(() => import("pages/Settings"));
const Setup = lazy(() => import("pages/Setup"));
const Users = lazy(() => import("pages/Users"));

function Router() {
	const health = useHealth();
	const { authenticated } = useAuthState();
	const { locale } = useLocaleState();
	const Spinner = <SpinnerPage />;

	if (health.isLoading) {
		return Spinner;
	}

	if (health.isError || !health.data?.healthy) {
		return <Unhealthy />;
	}

	if (health.data?.healthy && !health.data?.setup) {
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
		<BrowserRouter>
			<SiteWrapper key={`locale-${locale}`}>
				<Suspense fallback={Spinner}>
					<Routes>
						<Route path="/hosts" element={<Hosts />} />
						<Route path="/ssl/certificates" element={<Certificates />} />
						<Route
							path="/ssl/authorities"
							element={<CertificateAuthorities />}
						/>
						<Route path="/ssl/dns-providers" element={<DNSProviders />} />
						<Route path="/audit-log" element={<AuditLog />} />
						<Route path="/access-lists" element={<AccessLists />} />
						<Route path="/users" element={<Users />} />
						<Route
							path="/settings/nginx-templates"
							element={<NginxTemplates />}
						/>
						<Route path="/settings/general" element={<GeneralSettings />} />
						<Route path="/" element={<Dashboard />} />
					</Routes>
				</Suspense>
			</SiteWrapper>
		</BrowserRouter>
	);
}

export default Router;
