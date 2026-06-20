import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import Alert from "react-bootstrap/Alert";
import { createAgent, deleteAgent, testAgent } from "src/api/backend";
import { Button, LoadingPage } from "src/components";
import { useAgents } from "src/hooks";

export default function Agents() {
	const queryClient = useQueryClient();
	const { data, isLoading, isError, error } = useAgents();
	const [form, setForm] = useState({ name: "", url: "", identity: "", secret: "" });
	const [message, setMessage] = useState<string | null>(null);
	const [errorMsg, setErrorMsg] = useState<string | null>(null);

	if (isLoading) return <LoadingPage />;
	if (isError) return <Alert variant="danger">{error?.message || "Unknown error"}</Alert>;

	const refresh = () => queryClient.invalidateQueries({ queryKey: ["agents"] });
	const setValue = (key: string, value: string) => setForm((old) => ({ ...old, [key]: value }));

	const addAgent = async () => {
		setMessage(null);
		setErrorMsg(null);
		try {
			await createAgent(form);
			setForm({ name: "", url: "", identity: "", secret: "" });
			setMessage("Agent added");
			refresh();
		} catch (err: any) {
			setErrorMsg(err.message || `${err}`);
		}
	};

	const test = async (id: number) => {
		setMessage(null);
		setErrorMsg(null);
		try {
			await testAgent(id);
			setMessage("Agent test succeeded");
			refresh();
		} catch (err: any) {
			setErrorMsg(err.message || `${err}`);
		}
	};

	const remove = async (id: number) => {
		setMessage(null);
		setErrorMsg(null);
		try {
			await deleteAgent(id);
			setMessage("Agent deleted");
			refresh();
		} catch (err: any) {
			setErrorMsg(err.message || `${err}`);
		}
	};

	return (
		<div className="card mt-4">
			<div className="card-status-top bg-blue" />
			<div className="card-header">
				<h2 className="mb-0">Agents</h2>
			</div>
			<div className="card-body">
				{message ? <Alert variant="success">{message}</Alert> : null}
				{errorMsg ? <Alert variant="danger">{errorMsg}</Alert> : null}
				<p className="text-muted">
					Add remote Nginx Proxy Manager instances. The proxy host page can then switch nodes and forward
					operations to the selected instance.
				</p>
				<div className="row g-2 mb-4">
					<div className="col-md-2"><input className="form-control" placeholder="Name" value={form.name} onChange={(e) => setValue("name", e.target.value)} /></div>
					<div className="col-md-4"><input className="form-control" placeholder="URL, e.g. https://npm.example.com" value={form.url} onChange={(e) => setValue("url", e.target.value)} /></div>
					<div className="col-md-2"><input className="form-control" placeholder="Email" value={form.identity} onChange={(e) => setValue("identity", e.target.value)} /></div>
					<div className="col-md-2"><input className="form-control" placeholder="Password" type="password" value={form.secret} onChange={(e) => setValue("secret", e.target.value)} /></div>
					<div className="col-md-2"><Button className="btn-primary w-100" onClick={addAgent}>Add</Button></div>
				</div>
				<div className="table-responsive">
					<table className="table table-vcenter">
						<thead><tr><th>Name</th><th>URL</th><th>Login</th><th>Status</th><th className="w-1">Actions</th></tr></thead>
						<tbody>
							{data?.map((agent) => (
								<tr key={agent.id}>
									<td>{agent.name}</td>
									<td>{agent.url}</td>
									<td>{agent.identity}</td>
									<td>{agent.meta?.lastTest?.ok ? "online" : agent.enabled ? "unknown" : "disabled"}</td>
									<td className="text-nowrap">
										<Button size="sm" className="me-2" onClick={() => test(agent.id)}>Test</Button>
										<Button size="sm" className="btn-danger" onClick={() => remove(agent.id)}>Delete</Button>
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			</div>
		</div>
	);
}
