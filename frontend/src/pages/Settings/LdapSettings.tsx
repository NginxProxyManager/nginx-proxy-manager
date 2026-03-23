import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";
import { Alert } from "react-bootstrap";
import { IconLock } from "@tabler/icons-react";
import { Button, Loading } from "src/components";
import { getLdapSettings, type LdapSettings as LdapSettingsData, type LdapEnvOverrideFields } from "src/api/backend/getLdapSettings";
import { updateLdapSettings, type LdapSettingsPayload } from "src/api/backend/updateLdapSettings";
import { testLdapConnection } from "src/api/backend/testLdapConnection";
import { testLdapAuth } from "src/api/backend/testLdapAuth";
import { syncLdapUsers, type LdapSyncResult } from "src/api/backend/syncLdapUsers";
import { showObjectSuccess } from "src/notifications";

// ---------------------------------------------------------------------------
// Env override helpers
// ---------------------------------------------------------------------------

/** Maps each overridable field to the environment variable that controls it. */
const ENV_VAR_MAP: Record<keyof LdapEnvOverrideFields, string> = {
	serverUrl:     "LDAP_SERVER_URL",
	bindDN:        "LDAP_BIND_DN",
	bindPassword:  "LDAP_BIND_PASSWORD",
	searchBase:    "LDAP_SEARCH_BASE",
	groupDN:       "LDAP_GROUP_DN",
	userAttribute: "LDAP_USER_ATTR",
	adminGroup:    "LDAP_ADMIN_GROUP",
	userGroup:     "LDAP_USER_GROUP",
	enabled:       "LDAP_ENABLED",
	tlsVerify:     "LDAP_TLS_VERIFY",
	starttls:      "LDAP_STARTTLS",
};

/**
 * Returns true if the given field is currently overridden by an env var.
 */
function isOverridden(overrides: LdapEnvOverrideFields | null | undefined, field: keyof LdapEnvOverrideFields): boolean {
	return !!(overrides && overrides[field]);
}

/**
 * Small inline badge shown next to labels of env-overridden fields.
 * Includes a tooltip explaining which env var is responsible.
 */
function EnvBadge({ field }: { field: keyof LdapEnvOverrideFields }) {
	const envVar = ENV_VAR_MAP[field];
	return (
		<span
			className="badge bg-orange-lt ms-2 text-orange d-inline-flex align-items-center gap-1"
			title={`This value is set via the ${envVar} environment variable and cannot be changed here.`}
			style={{ fontSize: "0.7em", verticalAlign: "middle", cursor: "help" }}
		>
			<IconLock size={10} stroke={2} />
			ENV
		</span>
	);
}

/**
 * Inline styles to keep disabled/readOnly env-overridden fields readable on dark themes.
 * Native browser disabled styling dims controls to near-invisible on dark backgrounds.
 */
// env override styles now handled via .env-locked-input CSS class

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

function useLdapSettings() {
	return useQuery<LdapSettingsData, Error>({
		queryKey: ["ldap-settings"],
		queryFn: getLdapSettings,
		staleTime: 60 * 1000,
	});
}

function useUpdateLdapSettings() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (data: LdapSettingsPayload) => updateLdapSettings(data),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["ldap-settings"] });
			queryClient.invalidateQueries({ queryKey: ["audit-logs"] });
		},
	});
}

// ---------------------------------------------------------------------------
// Helper types
// ---------------------------------------------------------------------------

type TestStatus = { type: "success" | "error" | "idle"; message: string };

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function LdapSettings() {
	const { data, isLoading, error } = useLdapSettings();
	const { mutate: saveSettings } = useUpdateLdapSettings();

	// Form state — mirrors LdapSettings fields
	const [form, setForm] = useState<LdapSettingsPayload | null>(null);
	const [isSaving, setIsSaving] = useState(false);
	const [saveError, setSaveError] = useState<ReactNode | null>(null);

	// Connection test
	const [connTest, setConnTest] = useState<TestStatus>({ type: "idle", message: "" });
	const [isTesting, setIsTesting] = useState(false);

	// Auth test
	const [authUsername, setAuthUsername] = useState("");
	const [authPassword, setAuthPassword] = useState("");
	const [authTest, setAuthTest] = useState<TestStatus>({ type: "idle", message: "" });
	const [isTestingAuth, setIsTestingAuth] = useState(false);

	// Enable/disable confirm dialog
	const [showEnableConfirm, setShowEnableConfirm] = useState(false);
	const [pendingEnabled, setPendingEnabled] = useState<boolean>(false);

	// Sync Now
	const [isSyncing, setIsSyncing] = useState(false);
	const [syncResult, setSyncResult] = useState<LdapSyncResult | null>(null);
	const [syncError, setSyncError] = useState<string | null>(null);

	// Sync form from loaded data (only once)
	const currentForm: LdapSettingsPayload = form ?? {
		serverUrl:     data?.serverUrl     ?? "",
		bindDN:        data?.bindDN        ?? "",
		bindPassword:  data?.bindPassword  ?? "",
		searchBase:    data?.searchBase    ?? "",
		userFilter:    data?.userFilter    ?? "",
		groupDN:       data?.groupDN       ?? "",
		userAttribute: data?.userAttribute ?? "uid",
		adminGroup:    data?.adminGroup    ?? "",
		userGroup:     data?.userGroup     ?? "",
		enabled:       data?.enabled       ?? false,
		tlsVerify:     data?.tlsVerify     ?? true,
		starttls:      data?.starttls      ?? false,
	};

	const setField = (key: keyof LdapSettingsPayload, value: any) =>
		setForm((prev) => ({ ...(prev ?? currentForm), [key]: value }));

	// ---------------------------------------------------------------------------
	// Handlers
	// ---------------------------------------------------------------------------

	const handleSave = async (e: React.FormEvent) => {
		e.preventDefault();
		if (isSaving) return;
		setIsSaving(true);
		setSaveError(null);

		saveSettings(currentForm, {
			onError: (err: any) => setSaveError(err.message),
			onSuccess: () => {
				showObjectSuccess("setting", "saved");
				setForm(null); // reset local form state; reload from query
			},
			onSettled: () => setIsSaving(false),
		});
	};

	const handleTestConnection = async () => {
		if (isTesting) return;
		setIsTesting(true);
		setConnTest({ type: "idle", message: "" });
		try {
			// Guard: if serverUrl is empty in form state (e.g. stale/race condition),
			// fall back to the last fetched value from the server.
			const payload: LdapSettingsPayload = {
				...currentForm,
				serverUrl: currentForm.serverUrl || data?.serverUrl || "",
			};
			const result = await testLdapConnection(payload);
			setConnTest({ type: result.success ? "success" : "error", message: result.message });
		} catch (err: any) {
			setConnTest({ type: "error", message: err.message });
		} finally {
			setIsTesting(false);
		}
	};

	const handleTestAuth = async () => {
		if (isTestingAuth) return;
		setIsTestingAuth(true);
		setAuthTest({ type: "idle", message: "" });
		try {
			const result = await testLdapAuth({ ...currentForm, username: authUsername, password: authPassword });
			setAuthTest({ type: result.success ? "success" : "error", message: result.message });
		} catch (err: any) {
			setAuthTest({ type: "error", message: err.message });
		} finally {
			setIsTestingAuth(false);
		}
	};

	const handleToggleEnabled = () => {
		const next = !currentForm.enabled;
		setPendingEnabled(next);
		setShowEnableConfirm(true);
	};

	const confirmToggleEnabled = () => {
		setField("enabled", pendingEnabled);
		setShowEnableConfirm(false);
	};

	const handleSyncNow = async () => {
		if (isSyncing) return;
		setIsSyncing(true);
		setSyncResult(null);
		setSyncError(null);
		try {
			const result = await syncLdapUsers();
			setSyncResult(result);
		} catch (err: any) {
			setSyncError(err.message || "Sync failed");
		} finally {
			setIsSyncing(false);
		}
	};

	// ---------------------------------------------------------------------------
	// Render
	// ---------------------------------------------------------------------------

	if (!isLoading && error) {
		return (
			<div className="card-body">
				<Alert variant="danger" show>
					{error.message}
				</Alert>
			</div>
		);
	}

	if (isLoading) {
		return (
			<div className="card-body">
				<Loading noLogo />
			</div>
		);
	}

	const envOverrides = data?.envOverrides ?? null;
	const hasEnvOverrides = !!(envOverrides && Object.values(envOverrides).some(Boolean));

	return (
		<form onSubmit={handleSave}>
			{/* Override browser disabled dimming for env-locked controls */}
			<style>{`
				input.form-control.env-locked-input, input.form-control.env-locked-input:focus, input.form-control.env-locked-input:read-only, input.form-control.env-locked-input[readonly] { border-style: dashed !important; border-color: #e8590c !important; color: #ffffff !important; -webkit-text-fill-color: #ffffff !important; background-color: var(--tblr-bg-forms) !important; cursor: not-allowed !important; }
				.form-check-input:disabled.env-locked, .form-check-input.env-locked[disabled] { opacity: 1 !important; filter: none !important; cursor: not-allowed !important; }
				.form-check-input:disabled ~ .badge, .form-check-input:disabled + .badge { opacity: 1 !important; filter: none !important; color: #ffffff !important; }
				select.form-select:disabled.env-locked, select.form-select.env-locked[disabled] { opacity: 1 !important; filter: none !important; color: #ffffff !important; border-style: dashed !important; border-color: #e8590c !important; -webkit-text-fill-color: #ffffff !important; background-color: var(--tblr-bg-forms) !important; cursor: not-allowed !important; }
			`}</style>
			<div className="card-body">
				{/* Error banner */}
				<Alert variant="danger" show={!!saveError} onClose={() => setSaveError(null)} dismissible>
					{saveError}
				</Alert>

				{/* Env override banner */}
				{hasEnvOverrides && (
					<div className="alert alert-warning d-flex align-items-start gap-2 mb-3" role="alert">
						<IconLock size={18} stroke={2} className="mt-1 flex-shrink-0 text-warning" />
						<div>
							<strong>Some fields are controlled by environment variables</strong> and cannot be changed
							via the UI. Fields marked with <span className="badge bg-orange-lt text-orange" style={{ fontSize: "0.75em" }}>ENV</span> reflect the current environment variable value.
						</div>
					</div>
				)}

				{/* ── Enable/Disable toggle ─────────────────────────────────── */}
				<div className="mb-4">
					<div className="d-flex align-items-center justify-content-between">
						<div>
							<h4 className="mb-0">
								LDAP Authentication
								{isOverridden(envOverrides, "enabled") && <EnvBadge field="enabled" />}
							</h4>
							<small className="text-muted">
								Allow users to sign in using an external LDAP / Active Directory server.
							</small>
						</div>
						<label className="form-check form-switch ms-3 mb-0 d-flex align-items-center gap-2">
							<input
								className={`form-check-input${isOverridden(envOverrides, "enabled") ? " env-locked" : ""}`}
								type="checkbox"
								checked={!!currentForm.enabled}
								onChange={handleToggleEnabled}
								disabled={isOverridden(envOverrides, "enabled")}
								title={isOverridden(envOverrides, "enabled") ? `Controlled by ${ENV_VAR_MAP.enabled} environment variable` : undefined}
							/>
							{currentForm.enabled ? (
								<span className="badge bg-success" style={{ color: "#ffffff" }}>Enabled</span>
							) : (
								<span className="badge bg-danger" style={{ color: "#ffffff" }}>Disabled</span>
							)}
						</label>
					</div>

					{/* Confirm dialog */}
					{showEnableConfirm && (
						<Alert variant="warning" className="mt-3">
							<strong>
								{pendingEnabled
									? "Enable LDAP authentication?"
									: "Disable LDAP authentication?"}
							</strong>
							<p className="mb-2 mt-1 text-sm">
								{pendingEnabled
									? "Users matching an LDAP account will be able to log in once you save."
									: "LDAP logins will be blocked. Local accounts are unaffected."}
							</p>
							<div className="d-flex gap-2">
								<button
									type="button"
									className="btn btn-sm btn-warning"
									onClick={confirmToggleEnabled}
								>
									Confirm
								</button>
								<button
									type="button"
									className="btn btn-sm btn-secondary"
									onClick={() => setShowEnableConfirm(false)}
								>
									Cancel
								</button>
							</div>
						</Alert>
					)}
				</div>

				<hr className="my-3" />

				{/* ── Server connection ─────────────────────────────────────── */}
				<h5 className="mb-3">Server Connection</h5>

				<div className="mb-3">
					<label className="form-label" htmlFor="ldap-server-url">
						Server URL <span className="text-danger">*</span>
						{isOverridden(envOverrides, "serverUrl") && <EnvBadge field="serverUrl" />}
					</label>
					<input
						id="ldap-server-url"
						type="text"
						className="form-control"
						placeholder="ldap://dc.example.com  or  ldaps://dc.example.com:636"
						value={currentForm.serverUrl ?? ""}
						onChange={(e) => { if (!isOverridden(envOverrides, "serverUrl")) setField("serverUrl", e.target.value); }}
						title={isOverridden(envOverrides, "serverUrl") ? `Controlled by ${ENV_VAR_MAP.serverUrl} environment variable` : undefined}
						autoComplete="off"
					/>
					<div className="form-hint">
						<strong>OpenLDAP:</strong> <code>ldap://ldap.example.com</code> &nbsp;|&nbsp;
						<strong>Active Directory:</strong> <code>ldap://dc01.corp.local</code> or{" "}
						<code>ldaps://dc01.corp.local:636</code>
					</div>
				</div>

				<div className="row g-3 mb-3">
					<div className="col-12 col-md-6">
						<label className="form-check form-switch">
							<input
								className={`form-check-input${isOverridden(envOverrides, "tlsVerify") ? " env-locked" : ""}`}
								type="checkbox"
								checked={!!currentForm.tlsVerify}
								onChange={(e) => setField("tlsVerify", e.target.checked)}
								disabled={isOverridden(envOverrides, "tlsVerify")}
								title={isOverridden(envOverrides, "tlsVerify") ? `Controlled by ${ENV_VAR_MAP.tlsVerify} environment variable` : undefined}
							/>
							<span className="form-check-label">
								Verify TLS Certificate
								{isOverridden(envOverrides, "tlsVerify") && <EnvBadge field="tlsVerify" />}
							</span>
						</label>
						<div className="form-hint">
							Uncheck only for self-signed certificates in development.
						</div>
					</div>
					<div className="col-12 col-md-6">
						<label className="form-check form-switch">
							<input
								className={`form-check-input${isOverridden(envOverrides, "starttls") ? " env-locked" : ""}`}
								type="checkbox"
								checked={!!currentForm.starttls}
								onChange={(e) => setField("starttls", e.target.checked)}
								disabled={isOverridden(envOverrides, "starttls")}
								title={isOverridden(envOverrides, "starttls") ? `Controlled by ${ENV_VAR_MAP.starttls} environment variable` : undefined}
							/>
							<span className="form-check-label">
								Use STARTTLS
								{isOverridden(envOverrides, "starttls") && <EnvBadge field="starttls" />}
							</span>
						</label>
						<div className="form-hint">
							Upgrade a plain <code>ldap://</code> connection to TLS. Do not use with <code>ldaps://</code>.
						</div>
					</div>
				</div>

				{/* ── Bind credentials ─────────────────────────────────────── */}
				<h5 className="mb-3 mt-4">Bind Credentials</h5>

				<div className="mb-3">
					<label className="form-label" htmlFor="ldap-bind-dn">
						Bind DN
						{isOverridden(envOverrides, "bindDN") && <EnvBadge field="bindDN" />}
					</label>
					<input
						id="ldap-bind-dn"
						type="text"
						className={`form-control${isOverridden(envOverrides, "bindDN") ? " env-locked-input" : ""}`}
						placeholder="cn=svc-npm,ou=service,dc=example,dc=com"
						value={currentForm.bindDN ?? ""}
						onChange={(e) => { if (!isOverridden(envOverrides, "bindDN")) setField("bindDN", e.target.value); }}
						title={isOverridden(envOverrides, "bindDN") ? `Controlled by ${ENV_VAR_MAP.bindDN} environment variable` : undefined}
						autoComplete="off"
					/>
					<div className="form-hint">
						<strong>OpenLDAP:</strong> <code>cn=binduser,dc=example,dc=com</code> &nbsp;|&nbsp;
						<strong>AD:</strong> <code>svc-npm@corp.local</code> (UPN) or full DN
					</div>
				</div>

				<div className="mb-3">
					<label className="form-label" htmlFor="ldap-bind-password">
						Bind Password
						{isOverridden(envOverrides, "bindPassword") && <EnvBadge field="bindPassword" />}
					</label>
					<input
						id="ldap-bind-password"
						type="password"
						className={`form-control${isOverridden(envOverrides, "bindPassword") ? " env-locked-input" : ""}`}
						placeholder="Leave unchanged to keep existing password"
						value={currentForm.bindPassword ?? ""}
						onChange={(e) => { if (!isOverridden(envOverrides, "bindPassword")) setField("bindPassword", e.target.value); }}
						title={isOverridden(envOverrides, "bindPassword") ? `Controlled by ${ENV_VAR_MAP.bindPassword} environment variable` : undefined}
						autoComplete="new-password"
					/>
					<div className="form-hint">
						Stored encrypted. Shown as <code>••••••</code> once saved.
					</div>
				</div>

				{/* ── Directory structure ───────────────────────────────────── */}
				<h5 className="mb-3 mt-4">Directory Structure</h5>

				<div className="mb-3">
					<label className="form-label" htmlFor="ldap-search-base">
						Search Base DN <span className="text-danger">*</span>
						{isOverridden(envOverrides, "searchBase") && <EnvBadge field="searchBase" />}
					</label>
					<input
						id="ldap-search-base"
						type="text"
						className={`form-control${isOverridden(envOverrides, "searchBase") ? " env-locked-input" : ""}`}
						placeholder="dc=example,dc=com"
						value={currentForm.searchBase ?? ""}
						onChange={(e) => { if (!isOverridden(envOverrides, "searchBase")) setField("searchBase", e.target.value); }}
						title={isOverridden(envOverrides, "searchBase") ? `Controlled by ${ENV_VAR_MAP.searchBase} environment variable` : undefined}
						autoComplete="off"
					/>
					<div className="form-hint">
						<strong>OpenLDAP:</strong> <code>dc=example,dc=com</code> &nbsp;|&nbsp;
						<strong>AD:</strong> <code>DC=corp,DC=local</code>
					</div>
				</div>

				<div className="mb-3">
					<label className="form-label" htmlFor="ldap-user-attribute">
						User Login Attribute
						{isOverridden(envOverrides, "userAttribute") && <EnvBadge field="userAttribute" />}
					</label>
					<select
						id="ldap-user-attribute"
						className="form-select"
						value={currentForm.userAttribute ?? "uid"}
						onChange={(e) => setField("userAttribute", e.target.value as any)}
						disabled={isOverridden(envOverrides, "userAttribute")}
						title={isOverridden(envOverrides, "userAttribute") ? `Controlled by ${ENV_VAR_MAP.userAttribute} environment variable` : undefined}
					>
						<option value="uid">uid — OpenLDAP / POSIX</option>
						<option value="sAMAccountName">sAMAccountName — Active Directory</option>
						<option value="mail">mail — Email address</option>
						<option value="userPrincipalName">userPrincipalName — AD UPN (user@domain)</option>
					</select>
					<div className="form-hint">
						Attribute used to match the login username to a directory entry.
					</div>
				</div>

				<div className="mb-3">
					<label className="form-label" htmlFor="ldap-user-filter">
						User Filter (optional)
					</label>
					<input
						id="ldap-user-filter"
						type="text"
						className="form-control"
						placeholder="(objectClass=person)"
						value={currentForm.userFilter ?? ""}
						onChange={(e) => setField("userFilter", e.target.value)}
						autoComplete="off"
					/>
					<div className="form-hint">
						Additional LDAP filter applied to user searches, e.g. <code>(objectClass=inetOrgPerson)</code>.
					</div>
				</div>

				{/* ── Group settings ────────────────────────────────────────── */}
				<h5 className="mb-3 mt-4">Group Authorisation</h5>
				<p className="text-muted small mb-3">
					Optional. Leave blank to allow all authenticated users. When set, only members of the specified
					group are permitted.
				</p>

				<div className="mb-3">
					<label className="form-label" htmlFor="ldap-group-dn">
						Group Search Base DN
						{isOverridden(envOverrides, "groupDN") && <EnvBadge field="groupDN" />}
					</label>
					<input
						id="ldap-group-dn"
						type="text"
						className={`form-control${isOverridden(envOverrides, "groupDN") ? " env-locked-input" : ""}`}
						placeholder="ou=groups,dc=example,dc=com"
						value={currentForm.groupDN ?? ""}
						onChange={(e) => { if (!isOverridden(envOverrides, "groupDN")) setField("groupDN", e.target.value); }}
						title={isOverridden(envOverrides, "groupDN") ? `Controlled by ${ENV_VAR_MAP.groupDN} environment variable` : undefined}
						autoComplete="off"
					/>
					<div className="form-hint">
						Base DN where groups are searched. Defaults to <em>Search Base DN</em> if empty.
					</div>
				</div>

				<div className="mb-3">
					<label className="form-label" htmlFor="ldap-admin-group">
						Admin Group DN
						{isOverridden(envOverrides, "adminGroup") && <EnvBadge field="adminGroup" />}
					</label>
					<input
						id="ldap-admin-group"
						type="text"
						className={`form-control${isOverridden(envOverrides, "adminGroup") ? " env-locked-input" : ""}`}
						placeholder="cn=npm-admins,ou=groups,dc=example,dc=com"
						value={currentForm.adminGroup ?? ""}
						onChange={(e) => { if (!isOverridden(envOverrides, "adminGroup")) setField("adminGroup", e.target.value); }}
						title={isOverridden(envOverrides, "adminGroup") ? `Controlled by ${ENV_VAR_MAP.adminGroup} environment variable` : undefined}
						autoComplete="off"
					/>
					<div className="form-hint">
						Members of this group are provisioned with the <strong>admin</strong> role in NPM.{" "}
						Separate multiple groups with a newline or by joining DNs end-to-end (e.g.{" "}
						<code>cn=admins,...,cn=super-admins,...</code>). User is admin if in <em>any</em> listed group.
					</div>
				</div>

				<div className="mb-3">
					<label className="form-label" htmlFor="ldap-user-group">
						User Group DN
						{isOverridden(envOverrides, "userGroup") && <EnvBadge field="userGroup" />}
					</label>
					<input
						id="ldap-user-group"
						type="text"
						className={`form-control${isOverridden(envOverrides, "userGroup") ? " env-locked-input" : ""}`}
						placeholder="cn=npm-users,ou=groups,dc=example,dc=com"
						value={currentForm.userGroup ?? ""}
						onChange={(e) => { if (!isOverridden(envOverrides, "userGroup")) setField("userGroup", e.target.value); }}
						title={isOverridden(envOverrides, "userGroup") ? `Controlled by ${ENV_VAR_MAP.userGroup} environment variable` : undefined}
						autoComplete="off"
					/>
					<div className="form-hint">
						Members of this group are provisioned with the standard <strong>user</strong> role.
						Leave blank to allow all authenticated LDAP users. Supports multiple groups (same format as above).
					</div>
				</div>

				{/* ── Test Connection ───────────────────────────────────────── */}
				<hr className="my-4" />
				<h5 className="mb-3">Test Connection</h5>
				<p className="text-muted small mb-3">
					Verify that the server is reachable and the bind credentials are correct.
				</p>

				{connTest.type !== "idle" && (
					<Alert
						variant={connTest.type === "success" ? "success" : "danger"}
						show
						onClose={() => setConnTest({ type: "idle", message: "" })}
						dismissible
					>
						{connTest.message}
					</Alert>
				)}

				<div>
					<Button
						type="button"
						actionType="secondary"
						isLoading={isTesting}
						disabled={isTesting}
						onClick={handleTestConnection}
					>
						{isTesting ? "Testing…" : "Test Connection"}
					</Button>
				</div>

				{/* ── Test Authentication ───────────────────────────────────── */}
				<hr className="my-4" />
				<h5 className="mb-3">Test Authentication</h5>
				<p className="text-muted small mb-3">
					Enter a test account to verify end-to-end authentication against the directory.
				</p>

				{authTest.type !== "idle" && (
					<Alert
						variant={authTest.type === "success" ? "success" : "danger"}
						show
						onClose={() => setAuthTest({ type: "idle", message: "" })}
						dismissible
					>
						{authTest.message}
					</Alert>
				)}

				<div className="row g-3 mb-3">
					<div className="col-12 col-md-5">
						<label className="form-label" htmlFor="ldap-test-username">
							Username
						</label>
						<input
							id="ldap-test-username"
							type="text"
							className="form-control"
							placeholder="jsmith"
							value={authUsername}
							onChange={(e) => setAuthUsername(e.target.value)}
							autoComplete="off"
						/>
					</div>
					<div className="col-12 col-md-5">
						<label className="form-label" htmlFor="ldap-test-password">
							Password
						</label>
						<input
							id="ldap-test-password"
							type="password"
							className="form-control"
							placeholder="••••••••"
							value={authPassword}
							onChange={(e) => setAuthPassword(e.target.value)}
							autoComplete="new-password"
						/>
					</div>
					<div className="col-12 col-md-2 d-flex align-items-end">
						<Button
							type="button"
							actionType="secondary"
							isLoading={isTestingAuth}
							disabled={isTestingAuth || !authUsername || !authPassword}
							onClick={handleTestAuth}
							className="w-100"
						>
							{isTestingAuth ? "Testing…" : "Test Auth"}
						</Button>
					</div>
				</div>
				{/* ── Sync Now ─────────────────────────────────────────────────── */}
				<hr className="my-4" />
				<h5 className="mb-2">Force User Sync</h5>
				<p className="text-muted small mb-3">
					Re-check group membership for all LDAP-provisioned accounts without waiting for users to log in.
					Accounts removed from all allowed groups will be disabled immediately.
				</p>

				{syncError && (
					<Alert variant="danger" show onClose={() => setSyncError(null)} dismissible>
						{syncError}
					</Alert>
				)}

				{syncResult && (
					<Alert variant={syncResult.errors > 0 ? "warning" : "success"} show onClose={() => setSyncResult(null)} dismissible>
						<strong>Sync complete:</strong>{" "}
						{syncResult.synced} user(s) synced
						{syncResult.disabled > 0 && `, ${syncResult.disabled} disabled`}
						{syncResult.errors > 0 && `, ${syncResult.errors} error(s)`}.
						{syncResult.details.some((d) => d.status === "disabled") && (
							<ul className="mt-2 mb-0">
								{syncResult.details
									.filter((d) => d.status === "disabled")
									.map((d) => (
										<li key={d.userId}>
											<strong>{d.email}</strong> — {d.reason || "Disabled"}
										</li>
									))}
							</ul>
						)}
					</Alert>
				)}

				<div>
					<Button
						type="button"
						actionType="secondary"
						isLoading={isSyncing}
						disabled={isSyncing || !currentForm.enabled}
						onClick={handleSyncNow}
					>
						{isSyncing ? "Syncing…" : "Sync Now"}
					</Button>
					{!currentForm.enabled && (
						<span className="text-muted ms-2 small">LDAP must be enabled to sync.</span>
					)}
				</div>
		</div>

			{/* ── Footer / Save ─────────────────────────────────────────────── */}
			<div className="card-footer bg-transparent mt-auto">
				<div className="btn-list justify-content-end">
					<Button
						type="submit"
						actionType="primary"
						className="ms-auto bg-teal"
						isLoading={isSaving}
						disabled={isSaving}
					>
						Save
					</Button>
				</div>
			</div>
		</form>
	);
}
