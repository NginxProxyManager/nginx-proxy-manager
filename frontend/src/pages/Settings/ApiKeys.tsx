import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import Alert from "react-bootstrap/Alert";
import { createApiKey, deleteApiKey, getApiKeys } from "src/api/backend";
import { Button } from "src/components";
import { useQuery } from "@tanstack/react-query";
import { T } from "src/locale";
import { showDeleteConfirmModal } from "src/modals";

const DEFAULT_PERMS = {
	proxy_hosts: "manage",
	certificates: "manage",
	credentials: "manage",
};

export default function ApiKeys() {
	const queryClient = useQueryClient();
	const { data, isLoading, error } = useQuery({ queryKey: ["api-keys"], queryFn: getApiKeys });
	const [form, setForm] = useState({ name: "", expiresOn: "" });
	const [createdKey, setCreatedKey] = useState<string | null>(null);
	const [submitError, setSubmitError] = useState<string | null>(null);

	const handleCreate = async () => {
		setSubmitError(null);
		setCreatedKey(null);
		try {
			const result = await createApiKey({
				name: form.name,
				permissions: DEFAULT_PERMS,
				expiresOn: form.expiresOn || null,
			});
			if (result.key) setCreatedKey(result.key);
			queryClient.invalidateQueries({ queryKey: ["api-keys"] });
			setForm({ name: "", expiresOn: "" });
		} catch (e: any) {
			setSubmitError(e.message);
		}
	};

	if (isLoading) return <p>Loading...</p>;

	return (
		<div className="card-body">
			<h3 className="card-title">
				<T id="api-keys" />
			</h3>
			<p className="text-muted">
				<T id="api-keys.subtitle" />
			</p>
			{error ? <Alert variant="danger">{error.message}</Alert> : null}
			{submitError ? <Alert variant="danger">{submitError}</Alert> : null}
			{createdKey ? (
				<Alert variant="warning">
					<strong>
						<T id="api-keys.copy-once" />
					</strong>
					<pre className="mt-2 mb-0 user-select-all">{createdKey}</pre>
				</Alert>
			) : null}
			<div className="card mb-4">
				<div className="card-body row g-2">
					<div className="col-md-6">
						<input
							className="form-control"
							placeholder="Name"
							value={form.name}
							onChange={(e) => setForm({ ...form, name: e.target.value })}
						/>
					</div>
					<div className="col-md-4">
						<input
							className="form-control"
							type="date"
							value={form.expiresOn}
							onChange={(e) => setForm({ ...form, expiresOn: e.target.value })}
						/>
					</div>
					<div className="col-md-2">
						<Button className="btn-cyan w-100" onClick={handleCreate}>
							<T id="object.add" tData={{ object: "api-key" }} />
						</Button>
					</div>
				</div>
			</div>
			<table className="table">
				<thead>
					<tr>
						<th>Name</th>
						<th>Prefix</th>
						<th>Expires</th>
						<th />
					</tr>
				</thead>
				<tbody>
					{data?.map((k) => (
						<tr key={k.id}>
							<td>{k.name}</td>
							<td>
								<code>npmak_{k.keyPrefix}_…</code>
							</td>
							<td>{k.expiresOn || "—"}</td>
							<td>
								<Button
									size="sm"
									variant="outline-danger"
									onClick={() =>
										showDeleteConfirmModal({
											title: "Revoke API key",
											onConfirm: async () => {
												await deleteApiKey(k.id);
												queryClient.invalidateQueries({ queryKey: ["api-keys"] });
											},
											invalidations: [["api-keys"]],
											children: <T id="api-keys.revoke-confirm" />,
										})
									}
								>
									<T id="delete" />
								</Button>
							</td>
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}
