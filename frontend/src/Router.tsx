import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import {
	ErrorNotFound,
	LoadingPage,
	Page,
	SiteContainer,
	SiteFooter,
	SiteHeader,
	SiteMenu,
	Unhealthy,
} from "src/components";
import { useAuthState } from "src/context";
import { useCurrentUser, useHealth } from "src/hooks";

const SetupUser = lazy(() => import("src/pages/Setup/SetupUser"));
const SetupDatabase = lazy(() => import("src/pages/Setup/SetupDatabase"));
const Login = lazy(() => import("src/pages/Login"));
const Dashboard = lazy(() => import("src/pages/Dashboard"));
const Settings = lazy(() => import("src/pages/Settings"));
const Certificates = lazy(() => import("src/pages/Certificates"));
const Access = lazy(() => import("src/pages/Access"));
const AuditLog = lazy(() => import("src/pages/AuditLog"));
const Logs = lazy(() => import("src/pages/Logs"));
const Users = lazy(() => import("src/pages/Users"));
const ProxyHosts = lazy(() => import("src/pages/Nginx/ProxyHosts"));
const RedirectionHosts = lazy(() => import("src/pages/Nginx/RedirectionHosts"));
const DeadHosts = lazy(() => import("src/pages/Nginx/DeadHosts"));
const Streams = lazy(() => import("src/pages/Nginx/Streams"));
const PendingAccess = lazy(() => import("src/pages/PendingAccess"));

function takeSSOHandoff(): string | null {
	const url = new URL(window.location.href);
	if (!url.searchParams.has("sso_handoff")) return null;
	const code = url.searchParams.get("sso_handoff") ?? "";
	url.searchParams.delete("sso_handoff");
	window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
	return code;
}

function Router() {
	const health = useHealth();
	const { authenticated, completeSSO } = useAuthState();
	const [handoffCode] = useState(takeSSOHandoff);
	const [handoffPending, setHandoffPending] = useState(handoffCode !== null);
	const handoffStarted = useRef(false);
	const currentUser = useCurrentUser({
		enabled:
			authenticated &&
			!handoffPending &&
			Boolean(health.data?.healthy && health.data?.dbSetup && health.data?.setup),
		retry: false,
		refetchOnWindowFocus: true,
		refetchInterval: (query: any) =>
			query.state.data?.capabilities?.length === 0 ? 5000 : false,
	});

	useEffect(() => {
		if (handoffCode === null || handoffStarted.current) return;
		handoffStarted.current = true;
		void completeSSO(handoffCode)
			.catch(() => {
				const url = new URL(window.location.href);
				url.searchParams.set("sso_error", "sso_login_denied");
				window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
			})
			.finally(() => setHandoffPending(false));
	}, [completeSSO, handoffCode]);

	if (health.isLoading) {
		return <LoadingPage />;
	}

	if (health.isError || !health.data?.healthy) {
		return <Unhealthy />;
	}

	if (health.data?.healthy && !health.data?.dbSetup) {
		return (
			<Suspense fallback={<LoadingPage />}>
				<SetupDatabase />
			</Suspense>
		);
	}

	if (!health.data?.setup) {
		return <SetupUser />;
	}

	if (handoffPending) {
		return <LoadingPage />;
	}

	if (!authenticated) {
		return (
			<Suspense fallback={<LoadingPage />}>
				<Login />
			</Suspense>
		);
	}

	if (currentUser.isLoading) {
		return <LoadingPage />;
	}

	if (currentUser.isError || !currentUser.data?.capabilities.length) {
		return (
			<Suspense fallback={<LoadingPage />}>
				<PendingAccess profileUnavailable={currentUser.isError} />
			</Suspense>
		);
	}

	return (
		<BrowserRouter>
			<Page>
				<div>
					<SiteHeader />
					<SiteMenu />
				</div>
				<SiteContainer>
					<Suspense fallback={<LoadingPage noLogo />}>
						<Routes>
							<Route path="*" element={<ErrorNotFound />} />
							<Route path="/login" element={<Navigate to="/" replace />} />
							<Route path="/certificates" element={<Certificates />} />
							<Route path="/access" element={<Access />} />
							<Route path="/audit-log" element={<AuditLog />} />
							<Route path="/logs" element={<Logs />} />
							<Route path="/settings" element={<Settings />} />
							<Route path="/users" element={<Users />} />
							<Route path="/nginx/proxy" element={<ProxyHosts />} />
							<Route path="/nginx/redirection" element={<RedirectionHosts />} />
							<Route path="/nginx/404" element={<DeadHosts />} />
							<Route path="/nginx/stream" element={<Streams />} />
							<Route path="/" element={<Dashboard />} />
						</Routes>
					</Suspense>
				</SiteContainer>
				<SiteFooter />
			</Page>
		</BrowserRouter>
	);
}

export default Router;
export { takeSSOHandoff };
