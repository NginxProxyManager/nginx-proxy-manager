import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";
import { Alert } from "react-bootstrap";
import { Button, Loading } from "src/components";
import { getLdapSettings, type LdapSettings as LdapSettingsData } from "src/api/backend/getLdapSettings";
import { updateLdapSettings, type LdapSettingsPayload } from "src/api/backend/updateLdapSettings";
import { testLdapConnection } from "src/api/backend/testLdapConnection";
import { testLdapAuth } from "src/api/backend/testLdapAuth";
import { syncLdapUsers, type LdapSyncResult } from "src/api/backend/syncLdapUsers";
import { showObjectSuccess } from "src/notifications";

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

	return (
		<form onSubmit={handleSave}>
			<div className="card-body">
				{/* Error banner */}
				<Alert variant="danger" show={!!saveError} onClose={() => setSaveError(null)} dismissible>
					{saveError}
				</Alert>

				{/* ── Enable/Disable toggle ─────────────────────────────────── */}
				<div className="mb-4">
					<div className="d-flex align-items-center justify-content-between">
						<div>
							<h4 className="mb-0">LDAP Authentication</h4>
							<small className="text-muted">
								Allow users to sign in using an external LDAP / Active Directory server.
							</small>
						</div>
						<label className="form-check form-switch ms-3 mb-0">
							<input
								className="form-check-input"
								type="checkbox"
								checked={!!currentForm.enabled}
								onChange={handleToggleEnabled}
							/>
							<span className="form-check-label">
								{currentForm.enabled ? (
									<span className="badge bg-success">Enabled</span>
								) : (
									<span className="badge bg-secondary">Disabled</span>
								)}
							</span>
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
					</label>
					<input
						id="ldap-server-url"
						type="text"
						className="form-control"
						placeholder="ldap://dc.example.com  or  ldaps://dc.example.com:636"
						value={currentForm.serverUrl ?? ""}
						onChange={(e) => setField("serverUrl", e.target.value)}
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
								className="form-check-input"
								type="checkbox"
								checked={!!currentForm.tlsVerify}
								onChange={(e) => setField("tlsVerify", e.target.checked)}
							/>
							<span className="form-check-label">Verify TLS Certificate</span>
						</label>
						<div className="form-hint">
							Uncheck only for self-signed certificates in development.
						</div>
					</div>
					<div className="col-12 col-md-6">
						<label className="form-check form-switch">
							<input
								className="form-check-input"
								type="checkbox"
								checked={!!currentForm.starttls}
								onChange={(e) => setField("starttls", e.target.checked)}
							/>
							<span className="form-check-label">Use STARTTLS</span>
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
					</label>
					<input
						id="ldap-bind-dn"
						type="text"
						className="form-control"
						placeholder="cn=svc-npm,ou=service,dc=example,dc=com"
						value={currentForm.bindDN ?? ""}
						onChange={(e) => setField("bindDN", e.target.value)}
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
					</label>
					<input
						id="ldap-bind-password"
						type="password"
						className="form-control"
						placeholder="Leave unchanged to keep existing password"
						value={currentForm.bindPassword ?? ""}
						onChange={(e) => setField("bindPassword", e.target.value)}
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
					</label>
					<input
						id="ldap-search-base"
						type="text"
						className="form-control"
						placeholder="dc=example,dc=com"
						value={currentForm.searchBase ?? ""}
						onChange={(e) => setField("searchBase", e.target.value)}
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
					</label>
					<select
						id="ldap-user-attribute"
						className="form-select"
						value={currentForm.userAttribute ?? "uid"}
						onChange={(e) => setField("userAttribute", e.target.value as any)}
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
					</label>
					<input
						id="ldap-group-dn"
						type="text"
						className="form-control"
						placeholder="ou=groups,dc=example,dc=com"
						value={currentForm.groupDN ?? ""}
						onChange={(e) => setField("groupDN", e.target.value)}
						autoComplete="off"
					/>
					<div className="form-hint">
						Base DN where groups are searched. Defaults to <em>Search Base DN</em> if empty.
					</div>
				</div>

				<div className="mb-3">
					<label className="form-label" htmlFor="ldap-admin-group">
						Admin Group DN
					</label>
					<input
						id="ldap-admin-group"
						type="text"
						className="form-control"
						placeholder="cn=npm-admins,ou=groups,dc=example,dc=com"
						value={currentForm.adminGroup ?? ""}
						onChange={(e) => setField("adminGroup", e.target.value)}
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
					</label>
					<input
						id="ldap-user-group"
						type="text"
						className="form-control"
						placeholder="cn=npm-users,ou=groups,dc=example,dc=com"
						value={currentForm.userGroup ?? ""}
						onChange={(e) => setField("userGroup", e.target.value)}
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
