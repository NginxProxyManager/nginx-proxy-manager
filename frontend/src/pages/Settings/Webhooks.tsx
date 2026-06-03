import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import Alert from "react-bootstrap/Alert";
import { createWebhook, deleteWebhook, getWebhooks } from "src/api/backend";
import { Button } from "src/components";
import { T } from "src/locale";
import { showDeleteConfirmModal } from "src/modals";

const EVENT_OPTIONS = [
	"*",
	"proxy_host.created",
	"proxy_host.updated",
	"proxy_host.deleted",
	"certificate.created",
	"certificate.failed",
	"certificate.renewed",
];

export default function Webhooks() {
	const queryClient = useQueryClient();
	const { data, isLoading, error } = useQuery({ queryKey: ["webhooks"], queryFn: getWebhooks });
	const [form, setForm] = useState({
		name: "",
		url: "",
		events: "certificate.created,certificate.failed",
		secret: "",
	});
	const [createdSecret, setCreatedSecret] = useState<string | null>(null);

	const handleCreate = async () => {
		setCreatedSecret(null);
		const result = await createWebhook({
			name: form.name,
			url: form.url,
			events: form.events.split(",").map((e) => e.trim()).filter(Boolean),
			secret: form.secret || undefined,
		});
		if (result.secret) setCreatedSecret(result.secret);
		queryClient.invalidateQueries({ queryKey: ["webhooks"] });
	};

	if (isLoading) return <p>Loading...</p>;

	return (
		<div className="card-body">
			<h3 className="card-title">
				<T id="webhooks" />
			</h3>
			<p className="text-muted">
				<T id="webhooks.subtitle" />
			</p>
			{error ? <Alert variant="danger">{error.message}</Alert> : null}
			{createdSecret ? (
				<Alert variant="info">
					<T id="webhooks.signing-secret" />: <code>{createdSecret}</code>
				</Alert>
			) : null}
			<div className="card mb-4">
				<div className="card-body row g-2">
					<div className="col-md-4">
						<input
							className="form-control"
							placeholder="Name"
							value={form.name}
							onChange={(e) => setForm({ ...form, name: e.target.value })}
						/>
					</div>
					<div className="col-md-8">
						<input
							className="form-control"
							placeholder="https://hooks.example.com/npm"
							value={form.url}
							onChange={(e) => setForm({ ...form, url: e.target.value })}
						/>
					</div>
					<div className="col-12">
						<input
							className="form-control"
							placeholder={EVENT_OPTIONS.join(",")}
							value={form.events}
							onChange={(e) => setForm({ ...form, events: e.target.value })}
						/>
					</div>
					<div className="col-12">
						<Button className="btn-cyan" onClick={handleCreate}>
							<T id="save" />
						</Button>
					</div>
				</div>
			</div>
			<table className="table">
				<thead>
					<tr>
						<th>Name</th>
						<th>URL</th>
						<th>Events</th>
						<th />
					</tr>
				</thead>
				<tbody>
					{data?.map((w) => (
						<tr key={w.id}>
							<td>{w.name}</td>
							<td className="text-truncate" style={{ maxWidth: 200 }}>
								{w.url}
							</td>
							<td className="small">{w.events?.join(", ")}</td>
							<td>
								<Button
									size="sm"
									variant="outline-danger"
									onClick={() =>
										showDeleteConfirmModal({
											title: "Delete webhook",
											onConfirm: async () => {
												await deleteWebhook(w.id);
												queryClient.invalidateQueries({ queryKey: ["webhooks"] });
											},
											invalidations: [["webhooks"]],
											children: <T id="object.delete.content" tData={{ object: "webhook" }} />,
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
