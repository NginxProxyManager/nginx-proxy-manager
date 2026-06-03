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

const PROVIDER_TYPES = ["vault", "aws", "azure", "infisical", "http"] as const;

const defaultMeta: Record<string, string> = {
	vault: '{"address":"https://vault.example:8200","mount":"secret","role":"npm"}',
	aws: '{"region":"us-east-1","role_arn":"arn:aws:iam::123456789012:role/npm-dns"}',
	azure: '{"tenant_id":"...","vault_url":"https://myvault.vault.azure.net"}',
	infisical: '{"host":"https://app.infisical.com","workspace_id":"..."}',
	http: '{"url_template":"https://secrets.example/api/{path}"}',
};

type FormState = {
	name: string;
	type: (typeof PROVIDER_TYPES)[number];
	oidcIssuer: string;
	oidcClientId: string;
	oidcClientSecret: string;
	oidcAudience: string;
	metaJson: string;
};

const emptyForm = (type: FormState["type"] = "vault"): FormState => ({
	name: "",
	type,
	oidcIssuer: "",
	oidcClientId: "",
	oidcClientSecret: "",
	oidcAudience: "",
	metaJson: defaultMeta[type],
});

export default function CredentialProviders() {
	const queryClient = useQueryClient();
	const { data, isLoading, isError, error } = useCredentialProviders();
	const [form, setForm] = useState<FormState>(emptyForm());
	const [editingId, setEditingId] = useState<number | null>(null);
	const [resolvePath, setResolvePath] = useState<Record<number, string>>({});
	const [testResult, setTestResult] = useState<string | null>(null);
	const [submitError, setSubmitError] = useState<string | null>(null);

	if (isLoading) return <LoadingPage noLogo />;

	const parseMeta = () => {
		try {
			return JSON.parse(form.metaJson);
		} catch {
			setSubmitError("Meta must be valid JSON");
			return null;
		}
	};

	const resetForm = () => {
		setEditingId(null);
		setForm(emptyForm());
		setSubmitError(null);
	};

	const startEdit = (p: CredentialProvider) => {
		setEditingId(p.id);
		setSubmitError(null);
		setTestResult(null);
		setForm({
			name: p.name,
			type: p.type as FormState["type"],
			oidcIssuer: p.oidcIssuer || "",
			oidcClientId: p.oidcClientId || "",
			oidcClientSecret: "",
			oidcAudience: p.oidcAudience || "",
			metaJson: JSON.stringify(p.meta || {}, null, 2),
		});
	};

	const handleSave = async () => {
		setSubmitError(null);
		const meta = parseMeta();
		if (!meta) return;

		try {
			const payload = {
				name: form.name,
				type: form.type,
				oidcIssuer: form.oidcIssuer,
				oidcClientId: form.oidcClientId,
				oidcAudience: form.oidcAudience || undefined,
				meta,
				...(form.oidcClientSecret ? { oidcClientSecret: form.oidcClientSecret } : {}),
			};

			if (editingId) {
				await updateCredentialProvider(editingId, payload);
			} else {
				if (!form.oidcClientSecret) {
					setSubmitError("Client secret is required for new providers");
					return;
				}
				await createCredentialProvider(payload);
			}
			showObjectSuccess("credential-provider", "saved");
			queryClient.invalidateQueries({ queryKey: ["credential-providers"] });
			resetForm();
		} catch (e: any) {
			setSubmitError(e.message);
		}
	};

	const handleTestOidc = async (id: number) => {
		setTestResult(null);
		try {
			const result = await testCredentialProvider(id);
			setTestResult(`OIDC OK: ${result.name} (${result.type})`);
		} catch (e: any) {
			setTestResult(`OIDC failed: ${e.message}`);
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
							<label className="form-label">Name</label>
							<input
								className="form-control"
								value={form.name}
								onChange={(e) => setForm({ ...form, name: e.target.value })}
							/>
						</div>
						<div className="col-md-6">
							<label className="form-label">Type</label>
							<select
								className="form-select"
								value={form.type}
								disabled={!!editingId}
								onChange={(e) =>
									setForm({
										...form,
										type: e.target.value as FormState["type"],
										metaJson: defaultMeta[e.target.value as keyof typeof defaultMeta],
									})
								}
							>
								{PROVIDER_TYPES.map((t) => (
									<option key={t} value={t}>
										{t}
									</option>
								))}
							</select>
						</div>
						<div className="col-12">
							<label className="form-label">OIDC issuer</label>
							<input
								className="form-control"
								value={form.oidcIssuer}
								onChange={(e) => setForm({ ...form, oidcIssuer: e.target.value })}
							/>
						</div>
						<div className="col-md-6">
							<label className="form-label">Client ID</label>
							<input
								className="form-control"
								value={form.oidcClientId}
								onChange={(e) => setForm({ ...form, oidcClientId: e.target.value })}
							/>
						</div>
						<div className="col-md-6">
							<label className="form-label">
								Client secret {editingId ? "(leave blank to keep)" : ""}
							</label>
							<input
								type="password"
								className="form-control"
								value={form.oidcClientSecret}
								onChange={(e) => setForm({ ...form, oidcClientSecret: e.target.value })}
							/>
						</div>
						<div className="col-12">
							<label className="form-label">Meta (JSON)</label>
							<textarea
								className="form-control font-monospace"
								rows={4}
								value={form.metaJson}
								onChange={(e) => setForm({ ...form, metaJson: e.target.value })}
							/>
						</div>
					</div>
					<div className="btn-list mt-3">
						<Button className="btn-cyan" onClick={handleSave}>
							<T id="save" />
						</Button>
						{editingId ? (
							<Button variant="outline-secondary" onClick={resetForm}>
								<T id="cancel" />
							</Button>
						) : null}
					</div>
				</div>
			</div>

			<table className="table table-vcenter">
				<thead>
					<tr>
						<th>Name</th>
						<th>Type</th>
						<th>OIDC</th>
						<th />
					</tr>
				</thead>
				<tbody>
					{data?.map((p: CredentialProvider) => (
						<tr key={p.id}>
							<td>{p.name}</td>
							<td>{p.type}</td>
							<td className="text-muted small">{p.oidcIssuer}</td>
							<td className="text-end">
								<div className="d-flex flex-wrap gap-1 justify-content-end align-items-center">
									<input
										className="form-control form-control-sm"
										style={{ maxWidth: 140 }}
										placeholder="secret/path"
										value={resolvePath[p.id] || ""}
										onChange={(e) =>
											setResolvePath((prev) => ({ ...prev, [p.id]: e.target.value }))
										}
									/>
									<Button size="sm" variant="outline-secondary" onClick={() => handleTestOidc(p.id)}>
										<T id="credential-providers.test-oidc" />
									</Button>
									<Button size="sm" variant="outline-secondary" onClick={() => handleTestResolve(p.id)}>
										<T id="credential-providers.test-resolve" />
									</Button>
									<Button size="sm" variant="outline-primary" onClick={() => startEdit(p)}>
										<T id="action.edit" />
									</Button>
									<Button
										size="sm"
										variant="outline-danger"
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
