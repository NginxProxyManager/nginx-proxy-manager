import { IconEdit, IconLock, IconPlugConnected, IconRefresh, IconTrash } from "@tabler/icons-react";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import Alert from "react-bootstrap/Alert";
import Dropdown from "react-bootstrap/Dropdown";
import {
	type AuthProvider,
	type AuthProviderType,
	deleteAuthProvider,
	runAuthProviderSync,
	setLocalAuth,
	testAuthProvider,
} from "src/api/backend";
import { Button, Loading } from "src/components";
import { useLocaleState } from "src/context";
import { useAuthProviders, useLocalAuth } from "src/hooks";
import { formatDateTime, intl, T } from "src/locale";
import { showAuthProviderModal, showDeleteConfirmModal } from "src/modals";
import { showError, showObjectSuccess, showSuccess } from "src/notifications";

const TYPES: AuthProviderType[] = ["ldap", "saml", "oauth"];

/**
 * The email + password switch. Turning it off is only offered once a provider
 * exists, and the backend refuses it otherwise, so nobody can lock themselves out.
 */
function LocalAuthToggle({ providerCount }: { providerCount: number }) {
	const queryClient = useQueryClient();
	const { data, isLoading } = useLocalAuth();
	const [saving, setSaving] = useState(false);

	if (isLoading || !data) {
		return null;
	}

	const onToggle = async () => {
		setSaving(true);
		try {
			await setLocalAuth(!data.localEnabled);
			queryClient.invalidateQueries({ queryKey: ["auth-local"] });
			queryClient.invalidateQueries({ queryKey: ["login-options"] });
			showObjectSuccess("auth-provider", "saved");
		} catch (err: any) {
			showError(err.message);
		}
		setSaving(false);
	};

	const canDisable = providerCount > 0;

	return (
		<div className="card-body border-bottom">
			<label className="form-check form-switch mb-0">
				<input
					type="checkbox"
					className="form-check-input"
					checked={data.localEnabled}
					disabled={saving || (data.localEnabled && !canDisable)}
					onChange={onToggle}
				/>
				<span className="form-check-label">
					<T id="auth-provider.local-enabled" />
				</span>
			</label>
			<small className="form-hint">
				<T id={canDisable ? "auth-provider.local-enabled-help" : "auth-provider.local-required-help"} />
			</small>
		</div>
	);
}

function ProviderRow({ provider }: { provider: AuthProvider }) {
	const queryClient = useQueryClient();
	const { locale } = useLocaleState();
	const [testing, setTesting] = useState(false);
	const [syncing, setSyncing] = useState(false);

	// Only LDAP directories can be enumerated
	const canSync = provider.type === "ldap" && provider.isEnabled;

	const onTest = async () => {
		setTesting(true);
		try {
			await testAuthProvider(provider.id);
			showObjectSuccess("auth-provider", "tested");
		} catch (err: any) {
			showError(err.message);
		}
		setTesting(false);
	};

	const onDelete = async () => {
		await deleteAuthProvider(provider.id);
		showObjectSuccess("auth-provider", "deleted");
	};

	const onSync = async () => {
		setSyncing(true);
		try {
			const result = await runAuthProviderSync(provider.id);
			queryClient.invalidateQueries({ queryKey: ["users"] });
			showSuccess(
				intl.formatMessage(
					{ id: "auth-provider.sync-result" },
					{
						created: result.created ?? 0,
						updated: result.updated ?? 0,
						disabled: result.disabled ?? 0,
					},
				),
			);
		} catch (err: any) {
			showError(err.message);
		}
		setSyncing(false);
	};

	return (
		<tr>
			<td>
				<div className="font-weight-medium">{provider.name}</div>
				<div className="text-secondary small">{formatDateTime(provider.modifiedOn, locale)}</div>
			</td>
			<td>
				<span className="badge bg-blue-lt text-uppercase">
					<T id={`auth-provider.type.${provider.type}`} />
				</span>
			</td>
			<td>
				{provider.isEnabled ? (
					<span className="badge bg-green-lt">
						<T id="auth-provider.enabled" />
					</span>
				) : (
					<span className="badge bg-secondary-lt">
						<T id="auth-provider.disabled" />
					</span>
				)}
				{provider.isEnvManaged ? (
					<span className="badge bg-azure-lt ms-1">
						<T id="auth-provider.env-managed" />
					</span>
				) : null}
			</td>
			<td>
				<div className="d-flex flex-wrap gap-1">
					{provider.meta?.autoCreateUser ? (
						<span className="badge bg-yellow-lt">
							<T id="auth-provider.auto-create-user" />
						</span>
					) : null}
					{provider.meta?.syncEnabled ? (
						<span className="badge bg-cyan-lt">
							<T id="auth-provider.sync-every" data={{ minutes: provider.meta.syncInterval ?? 60 }} />
						</span>
					) : null}
				</div>
			</td>
			<td className="text-end">
				<div className="btn-list justify-content-end">
					<Button size="sm" onClick={onTest} isLoading={testing}>
						<IconPlugConnected size={16} className="me-1" />
						<T id="auth-provider.test" />
					</Button>
					{canSync ? (
						<Button size="sm" onClick={onSync} isLoading={syncing}>
							<IconRefresh size={16} className="me-1" />
							<T id="auth-provider.sync-now" />
						</Button>
					) : null}
					<Button size="sm" onClick={() => showAuthProviderModal(provider)}>
						{provider.isEnvManaged ? (
							<IconLock size={16} className="me-1" />
						) : (
							<IconEdit size={16} className="me-1" />
						)}
						<T id={provider.isEnvManaged ? "auth-provider.view" : "edit"} />
					</Button>
					{provider.isEnvManaged ? null : (
						<Button
							size="sm"
							actionType="danger"
							variant="ghost"
							onClick={() =>
								showDeleteConfirmModal({
									title: <T id="object.delete" tData={{ object: "auth-provider" }} />,
									onConfirm: onDelete,
									invalidations: [["auth-providers"], ["login-options"]],
									children: <T id="object.delete.content" tData={{ object: "auth-provider" }} />,
								})
							}
						>
							<IconTrash size={16} />
						</Button>
					)}
				</div>
			</td>
		</tr>
	);
}

export default function AuthProviders() {
	const { data, isLoading, isError, error } = useAuthProviders();

	if (isLoading) {
		return <Loading noLogo />;
	}

	if (isError) {
		return (
			<Alert variant="danger" className="m-3">
				{error?.message || "Unknown error"}
			</Alert>
		);
	}

	const providers = data ?? [];

	return (
		<>
			<div className="card-header">
				<div className="row w-full">
					<div className="col">
						<h2 className="mt-1 mb-0">
							<T id="auth-providers" />
						</h2>
						<p className="text-secondary mb-0">
							<T id="auth-provider.intro" />
						</p>
					</div>
					<div className="col-md-auto col-sm-12">
						<Dropdown>
							<Dropdown.Toggle size="sm" className="btn btn-orange btn-sm">
								<T id="object.add" tData={{ object: "auth-provider" }} />
							</Dropdown.Toggle>
							<Dropdown.Menu align="end">
								{TYPES.map((type) => (
									<Dropdown.Item key={type} onClick={() => showAuthProviderModal(type)}>
										<T id={`auth-provider.type.${type}`} />
									</Dropdown.Item>
								))}
							</Dropdown.Menu>
						</Dropdown>
					</div>
				</div>
			</div>

			<LocalAuthToggle providerCount={providers.length} />

			{providers.length ? (
				<div className="table-responsive">
					<table className="table table-vcenter card-table">
						<thead>
							<tr>
								<th>
									<T id="column.name" />
								</th>
								<th>
									<T id="column.type" />
								</th>
								<th>
									<T id="column.status" />
								</th>
								<th>
									<T id="column.provisioning" />
								</th>
								<th />
							</tr>
						</thead>
						<tbody>
							{providers.map((provider) => (
								<ProviderRow key={provider.id} provider={provider} />
							))}
						</tbody>
					</table>
				</div>
			) : (
				<div className="card-body text-center my-4">
					<h2>
						<T id="object.empty" tData={{ objects: "auth-providers" }} />
					</h2>
					<p className="text-muted mb-0">
						<T id="auth-provider.empty-summary" />
					</p>
				</div>
			)}
		</>
	);
}
