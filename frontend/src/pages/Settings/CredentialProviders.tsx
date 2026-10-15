import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import Alert from "react-bootstrap/Alert";
import {
	createCredentialProvider,
	deleteCredentialProvider,
	testCredentialProvider,
	testCredentialProviderResolve,
	updateCredentialProvider,
} from "src/api/backend";
import type { CredentialProvider } from "src/api/backend/getCredentialProviders";
import { Button, LoadingPage } from "src/components";
import { useCredentialProviders } from "src/hooks";
import { T } from "src/locale";
import { showDeleteConfirmModal } from "src/modals";
import { showObjectSuccess } from "src/notifications";
import { OidcProviderFields } from "./credentialProviders/OidcProviderFields";
import { ProviderMetaFields } from "./credentialProviders/ProviderMetaFields";
import {
	PROVIDER_TYPE_LABELS,
	PROVIDER_TYPES,
	buildApiPayload,
	emptyForm,
	formFromProvider,
	type CredentialProviderFormState,
} from "./credentialProviders/types";

export default function CredentialProviders() {
	const queryClient = useQueryClient();
	const { data, isLoading, isError, error } = useCredentialProviders();
	const [form, setForm] = useState<CredentialProviderFormState>(emptyForm());
	const [editingId, setEditingId] = useState<number | null>(null);
	const [resolvePath, setResolvePath] = useState<Record<number, string>>({});
	const [testResult, setTestResult] = useState<string | null>(null);
	const [submitError, setSubmitError] = useState<string | null>(null);

	if (isLoading) return <LoadingPage noLogo />;

	const resetForm = () => {
		setEditingId(null);
		setForm(emptyForm());
		setSubmitError(null);
	};

	const startEdit = (p: CredentialProvider) => {
		setEditingId(p.id);
		setSubmitError(null);
		setTestResult(null);
		setForm(formFromProvider(p));
	};

	const validateBeforeSave = (): string | null => {
		if (!form.name.trim()) return "Name is required";
		if (form.type === "infisical") {
			if (!form.meta.workspaceId?.trim()) return "Project ID (workspace) is required";
			if (!form.oidcClientId.trim()) return "Client ID is required";
			if (!editingId && !form.oidcClientSecret.trim()) return "Client secret is required for new providers";
			return null;
		}
		if (!form.oidcIssuer.trim()) return "OIDC issuer is required";
		if (!form.oidcClientId.trim()) return "Client ID is required";
		if (!editingId && !form.oidcClientSecret.trim()) return "Client secret is required for new providers";
		if (form.type === "vault" && !form.meta.address?.trim()) return "Vault address is required";
		if (form.type === "aws" && (!form.meta.region?.trim() || !form.meta.roleArn?.trim())) {
			return "AWS region and role ARN are required";
		}
		if (form.type === "azure" && (!form.meta.tenantId?.trim() || !form.meta.vaultUrl?.trim())) {
			return "Azure tenant ID and vault URL are required";
		}
		if (form.type === "http" && !form.meta.urlTemplate?.trim()) return "HTTP URL template is required";
		return null;
	};

	const handleSave = async () => {
		setSubmitError(null);
		const validationError = validateBeforeSave();
		if (validationError) {
			setSubmitError(validationError);
			return;
		}

		try {
			const payload = buildApiPayload(form);
			if (editingId) {
				await updateCredentialProvider(editingId, payload);
			} else {
				await createCredentialProvider(payload);
			}
			showObjectSuccess("credential-provider", "saved");
			queryClient.invalidateQueries({ queryKey: ["credential-providers"] });
			resetForm();
		} catch (e: any) {
			setSubmitError(e.message);
		}
	};

	const handleTestAuth = async (id: number) => {
		setTestResult(null);
		try {
			const result = await testCredentialProvider(id);
			setTestResult(`Auth OK: ${result.name} (${PROVIDER_TYPE_LABELS[result.type as keyof typeof PROVIDER_TYPE_LABELS] || result.type})`);
		} catch (e: any) {
			setTestResult(`Auth failed: ${e.message}`);
		}
	};

	const handleTestResolve = async (id: number) => {
		const path = resolvePath[id]?.trim();
		if (!path) {
			setTestResult("Enter a secret path first");
			return;
		}
		setTestResult(null);
		try {
			const result = await testCredentialProviderResolve(id, path);
			setTestResult(`Resolve OK: ${result.ok ? "secret found" : "no data"} (${result.bytes ?? 0} bytes)`);
		} catch (e: any) {
			setTestResult(`Resolve failed: ${e.message}`);
		}
	};

	return (
		<div className="card-body">
			<h3 className="card-title">
				<T id="credential-providers" />
			</h3>
			<p className="text-muted">
				<T id="credential-providers.subtitle" />
			</p>

			{isError ? <Alert variant="danger">{error?.message}</Alert> : null}
			{submitError ? <Alert variant="danger">{submitError}</Alert> : null}
			{testResult ? <Alert variant="info">{testResult}</Alert> : null}

			<div className="card mb-4">
				<div className="card-header">
					{editingId ? (
						<T id="object.edit" tData={{ object: "credential-provider" }} />
					) : (
						<T id="object.add" tData={{ object: "credential-provider" }} />
					)}
				</div>
				<div className="card-body">
					<div className="row g-3">
						<div className="col-md-6">
							<label htmlFor="providerName" className="form-label">
								<T id="credential-providers.field.name" />
							</label>
							<input
								id="providerName"
								className="form-control"
								value={form.name}
								onChange={(e) => setForm({ ...form, name: e.target.value })}
							/>
						</div>
						<div className="col-md-6">
							<label htmlFor="providerType" className="form-label">
								<T id="credential-providers.field.type" />
							</label>
							<select
								id="providerType"
								className="form-select"
								value={form.type}
								disabled={!!editingId}
								onChange={(e) => {
									const type = e.target.value as CredentialProviderFormState["type"];
									setForm(emptyForm(type));
								}}
							>
								{PROVIDER_TYPES.map((t) => (
									<option key={t} value={t}>
										{PROVIDER_TYPE_LABELS[t]}
									</option>
								))}
							</select>
						</div>

						<ProviderMetaFields form={form} editingId={editingId} onChange={setForm} />

						{form.type !== "infisical" ? (
							<OidcProviderFields form={form} editingId={editingId} onChange={setForm} />
						) : null}
					</div>
					<div className="btn-list mt-3">
						<Button className="btn-cyan" onClick={handleSave}>
							<T id="save" />
						</Button>
						{editingId ? (
							<Button variant="outline" actionType="secondary" onClick={resetForm}>
								<T id="cancel" />
							</Button>
						) : null}
					</div>
				</div>
			</div>

			<table className="table table-vcenter">
				<thead>
					<tr>
						<th>
							<T id="credential-providers.field.name" />
						</th>
						<th>
							<T id="credential-providers.field.type" />
						</th>
						<th />
					</tr>
				</thead>
				<tbody>
					{data?.map((p: CredentialProvider) => (
						<tr key={p.id}>
							<td>{p.name}</td>
							<td>{PROVIDER_TYPE_LABELS[p.type as keyof typeof PROVIDER_TYPE_LABELS] || p.type}</td>
							<td className="text-end">
								<div className="d-flex flex-wrap gap-1 justify-content-end align-items-center">
									<input
										className="form-control form-control-sm"
										style={{ maxWidth: 140 }}
										placeholder="/DNS/cloudflare-api-token"
										value={resolvePath[p.id] || ""}
										onChange={(e) =>
											setResolvePath((prev) => ({ ...prev, [p.id]: e.target.value }))
										}
									/>
									<Button
										size="sm"
										variant="outline"
										actionType="secondary"
										onClick={() => handleTestAuth(p.id)}
									>
										<T id="credential-providers.test-auth" />
									</Button>
									<Button
										size="sm"
										variant="outline"
										actionType="secondary"
										onClick={() => handleTestResolve(p.id)}
									>
										<T id="credential-providers.test-resolve" />
									</Button>
									<Button size="sm" variant="outline" actionType="primary" onClick={() => startEdit(p)}>
										<T id="action.edit" />
									</Button>
									<Button
										size="sm"
										variant="outline"
										actionType="danger"
										onClick={() =>
											showDeleteConfirmModal({
												title: "Delete provider",
												onConfirm: async () => {
													await deleteCredentialProvider(p.id);
													queryClient.invalidateQueries({ queryKey: ["credential-providers"] });
												},
												invalidations: [["credential-providers"]],
												children: (
													<T id="object.delete.content" tData={{ object: "credential-provider" }} />
												),
											})
										}
									>
										<T id="delete" />
									</Button>
								</div>
							</td>
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}
