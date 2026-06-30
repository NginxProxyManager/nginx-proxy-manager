import { IconCheck, IconCopy, IconHelp, IconLock } from "@tabler/icons-react";
import { useState } from "react";
import { Alert } from "react-bootstrap";
import { Button, Loading } from "src/components";
import { useOidcConfig, useSetOidcConfig } from "src/hooks";
import { getOidcProviderUserCount, type OidcProviderConfig } from "src/api/backend";
import { intl, T } from "src/locale";
import { showDeleteConfirmModal, showHelpModal, showOidcProviderModal } from "src/modals";
import { showError, showObjectSuccess } from "src/notifications";
import OidcProviderTable from "./OidcProviderTable";

const emptyProvider = (): OidcProviderConfig => ({
	id: "",
	name: "",
	discoveryUrl: "",
	clientId: "",
	clientSecret: "",
	scopes: "openid email profile",
	enabled: true,
	usePar: false,
	autoProvision: false,
	autoProvisionRole: "user",
	autoProvisionAdminConfirm: false,
	claimMapping: {
		email: "email",
		name: "name",
		nickname: "preferred_username",
		avatar: "picture",
	},
});

export default function OidcSettings() {
	const { data, isLoading, error } = useOidcConfig();
	const { mutate: setOidcConfig } = useSetOidcConfig();
	const [copiedLogin, setCopiedLogin] = useState(false);
	const [copiedLink, setCopiedLink] = useState(false);
	const [externalBaseUrlInput, setExternalBaseUrlInput] = useState<string | null>(null);
	const [isSavingUrl, setIsSavingUrl] = useState(false);

	// Use the persisted External Base URL when set so displayed URLs match what the backend sends to the IdP.
	// Falls back to window.location.origin for deployments that aren't behind a reverse proxy.
	const effectiveOrigin = data?.externalBaseUrl || window.location.origin;
	const callbackUrl = `${effectiveOrigin}/api/oidc/callback`;
	const linkCallbackUrl = `${effectiveOrigin}/api/oidc/link-callback`;

	const handleCopyLogin = () => {
		navigator.clipboard.writeText(callbackUrl);
		setCopiedLogin(true);
		setTimeout(() => setCopiedLogin(false), 2000);
	};

	const handleCopyLink = () => {
		navigator.clipboard.writeText(linkCallbackUrl);
		setCopiedLink(true);
		setTimeout(() => setCopiedLink(false), 2000);
	};

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

	const providers = data?.providers ?? [];

	// External base URL: use in-progress edit state if present, otherwise use persisted value
	const isEnvUrl = data?.externalBaseUrlSource === "env";
	const persistedUrl = data?.externalBaseUrl ?? "";
	const externalBaseUrl = externalBaseUrlInput !== null ? externalBaseUrlInput : (persistedUrl ?? "");

	const handleSaveExternalUrl = () => {
		setIsSavingUrl(true);
		setOidcConfig(
			{ providers, externalBaseUrl },
			{
				onSuccess: () => {
					setIsSavingUrl(false);
					setExternalBaseUrlInput(null);
					showObjectSuccess("setting", "saved");
				},
				onError: (err: any) => {
					setIsSavingUrl(false);
					showError(err.message);
				},
			},
		);
	};

	const onNew = () => {
		showOidcProviderModal({
			provider: emptyProvider(),
			isNew: true,
			allProviders: providers,
			externalBaseUrl: persistedUrl,
		});
	};

	const onEdit = (index: number) => {
		// File-sourced providers are read-only, guard against accidental invocation
		if (providers[index]?.source === "file") {
			return;
		}
		showOidcProviderModal({
			provider: providers[index],
			isNew: false,
			allProviders: providers,
			externalBaseUrl: persistedUrl,
		});
	};

	const onToggleEnabled = (index: number) => {
		// File-sourced providers are read-only
		if (providers[index]?.source === "file") {
			return;
		}
		const cloned = [...providers];
		cloned[index] = { ...cloned[index], enabled: !cloned[index].enabled };
		setOidcConfig(
			{ providers: cloned, externalBaseUrl: persistedUrl },
			{
				onError: (err: any) => showError(err.message),
				onSuccess: () => showObjectSuccess("setting", "saved"),
			},
		);
	};

	const onDelete = async (index: number) => {
		const provider = providers[index];

		// File-sourced providers are read-only, cannot be deleted via the UI
		if (provider?.source === "file") {
			return;
		}

		// Fetch affected user count before showing the confirm modal
		let userCount = { total: 0, oidcOnly: 0 };
		try {
			userCount = await getOidcProviderUserCount(provider.id);
		} catch {
			// If fetch fails, proceed without count
		}

		showDeleteConfirmModal({
			title: intl.formatMessage({ id: "settings.oidc.remove-provider" }),
			children: (
				<>
					<T id="settings.oidc.remove-provider.confirm" />
					{userCount.total > 0 && (
						<div className="mt-3 text-start">
							<Alert variant="warning" className="mb-0">
								<T
									id="settings.oidc.remove-provider.affected-users"
									data={{ total: userCount.total, oidcOnly: userCount.oidcOnly }}
								/>
							</Alert>
						</div>
					)}
				</>
			),
			onConfirm: async () => {
				const cloned = [...providers];
				cloned.splice(index, 1);
				await new Promise<void>((resolve, reject) => {
					setOidcConfig(
						{ providers: cloned, externalBaseUrl: persistedUrl },
						{
							onError: (err: any) => reject(err),
							onSuccess: () => {
								showObjectSuccess("setting", "saved");
								resolve();
							},
						},
					);
				});
			},
		});
	};

	return (
		<>
			<div className="card-body">
				<div className="d-flex justify-content-between align-items-start mb-4">
					<p className="text-secondary fw-bold mb-0">
						<T id="settings.oidc.description" />
					</p>
					<div className="d-flex gap-2 ms-3 flex-shrink-0">
						<Button
							type="button"
							color="teal"
							onClick={onNew}
						>
							<T id="settings.oidc.add-provider" />
						</Button>
						<Button
							size="sm"
							onClick={() => showHelpModal("OidcProviders", "teal")}
						>
							<IconHelp size={20} />
						</Button>
					</div>
				</div>

				{/* External Base URL */}
				<div className="card card-sm mb-4">
					<div className="card-header py-1 px-3" style={{ backgroundColor: "var(--tblr-bg-surface-secondary)" }}>
						<h4 className="card-title mb-0" style={{ fontSize: "0.875rem" }}>
							<T id="settings.oidc.external-base-url" />
						</h4>
					</div>
					<div className="card-body py-2 px-3">
						<div className="input-group">
							<input
								type="url"
								className="form-control"
								placeholder={intl.formatMessage({ id: "settings.oidc.external-base-url.placeholder" })}
								value={externalBaseUrl ?? ""}
								onChange={(e) => setExternalBaseUrlInput(e.target.value)}
								disabled={isEnvUrl}
								aria-label={intl.formatMessage({ id: "settings.oidc.external-base-url" })}
							/>
							{isEnvUrl && (
								<span className="input-group-text text-secondary" title={intl.formatMessage({ id: "settings.oidc.external-base-url.env-tooltip" })}>
									<IconLock size={14} className="me-1" />
									<small><T id="settings.oidc.source.env" /></small>
								</span>
							)}
							{!isEnvUrl && (
								<Button
									type="button"
									color="teal"
									size="sm"
									isLoading={isSavingUrl}
									onClick={handleSaveExternalUrl}
								>
									<T id="save" />
								</Button>
							)}
						</div>
						<small className="text-secondary d-block mt-1">
							<T id="settings.oidc.external-base-url.help" />
						</small>
					</div>
				</div>

				{/* Callback URLs */}
				<div className="card card-sm mb-2">
					<div className="card-header py-1 px-3" style={{ backgroundColor: "var(--tblr-bg-surface-secondary)" }}>
						<h4 className="card-title mb-0" style={{ fontSize: "0.875rem" }}><T id="settings.oidc.callback-url" /></h4>
					</div>
					<ul className="list-group list-group-flush">
						<li className="list-group-item d-flex justify-content-between align-items-center py-1 cursor-pointer" style={{ paddingLeft: "8px", paddingRight: "8px" }} onClick={handleCopyLogin} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") handleCopyLogin(); }}>
							<code className="text-muted user-select-all" style={{ fontSize: "0.8rem" }}>{callbackUrl}</code>
							<button
								type="button"
								className="btn btn-link btn-icon btn-sm ms-2 flex-shrink-0"
								title={intl.formatMessage({ id: "settings.oidc.callback-url.login" })}
							>
								{copiedLogin ? (
									<IconCheck size={14} className="text-success" />
								) : (
									<IconCopy size={14} />
								)}
							</button>
						</li>
						<li className="list-group-item d-flex justify-content-between align-items-center py-1 cursor-pointer" style={{ paddingLeft: "8px", paddingRight: "8px" }} onClick={handleCopyLink} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") handleCopyLink(); }}>
							<code className="text-muted user-select-all" style={{ fontSize: "0.8rem" }}>{linkCallbackUrl}</code>
							<button
								type="button"
								className="btn btn-link btn-icon btn-sm ms-2 flex-shrink-0"
								title={intl.formatMessage({ id: "settings.oidc.callback-url.link" })}
							>
								{copiedLink ? (
									<IconCheck size={14} className="text-success" />
								) : (
									<IconCopy size={14} />
								)}
							</button>
						</li>
					</ul>
				</div>
				<small className="text-secondary d-block mb-4">
					<T id="settings.oidc.callback-url.both-help" />
				</small>
			</div>

			<div className="card-table px-3 pb-3">
				<div className="rounded overflow-hidden" style={{ border: "1px solid var(--tblr-border-color)", backgroundColor: "var(--tblr-bg-surface)" }}>
				<OidcProviderTable
					data={providers}
					isFetching={isLoading}
					onEdit={onEdit}
					onDelete={onDelete}
					onToggleEnabled={onToggleEnabled}
				/>
				</div>
			</div>
		</>
	);
}
