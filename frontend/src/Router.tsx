import { lazy, Suspense } from "react";

import { BrowserRouter, Route, Routes } from "react-router-dom";

import { TokenResponse } from "src/api/npm";
import { SiteWrapper, SpinnerPage, Unhealthy } from "src/components";
import { useAuthState, useLocaleState } from "src/context";
import { useHealth } from "src/hooks";

const AccessLists = lazy(() => import("src/pages/AccessLists"));
const AuditLog = lazy(() => import("src/pages/AuditLog"));
const Certificates = lazy(() => import("src/pages/Certificates"));
const CertificateAuthorities = lazy(
	() => import("src/pages/CertificateAuthorities"),
);
const Dashboard = lazy(() => import("src/pages/Dashboard"));
const DNSProviders = lazy(() => import("src/pages/DNSProviders"));
const Hosts = lazy(() => import("src/pages/Hosts"));
const NginxTemplates = lazy(() => import("src/pages/NginxTemplates"));
const Login = lazy(() => import("src/pages/Login"));
const GeneralSettings = lazy(() => import("src/pages/Settings"));
const Setup = lazy(() => import("src/pages/Setup"));
const Upstreams = lazy(() => import("src/pages/Upstreams"));
const Users = lazy(() => import("src/pages/Users"));

function Router() {
	const health = useHealth();
	const { authenticated, handleTokenUpdate } = useAuthState();
	const { locale } = useLocaleState();
	const Spinner = <SpinnerPage />;

	// Load token from URL Query Params
	const searchParams = new URLSearchParams(document.location.search);
	const t = searchParams.get("token_response");
	if (t) {
		const tokenResponse: TokenResponse = JSON.parse(t);
		handleTokenUpdate(tokenResponse);
		window.location.href = "/";
		return;
	}
	// End Load token from URL Query Params

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
						<Route path="/upstreams" element={<Upstreams />} />
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
