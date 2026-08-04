import { IconEdit, IconHelpCircle, IconPlus, IconRefresh, IconTrash } from "@tabler/icons-react";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import Alert from "react-bootstrap/Alert";
import OverlayTrigger from "react-bootstrap/OverlayTrigger";
import Tooltip from "react-bootstrap/Tooltip";
import { deleteUpstream, publishUpstream, type Upstream } from "src/api/backend";
import { Button, HasPermission, LoadingPage } from "src/components";
import { useUpstreams } from "src/hooks";
import { intl, T } from "src/locale";
import { showDeleteConfirmModal } from "src/modals";
import { showUpstreamModal } from "src/modals/UpstreamModal";
import { MANAGE, UPSTREAMS } from "src/modules/Permissions";
import { showError, showObjectSuccess } from "src/notifications";

const deploymentStatusColors: Record<string, string> = {
	pending: "#664d03",
	online: "#146c43",
	degraded: "#7a4b00",
	error: "#842029",
	recovering: "#084298",
	disabled: "#41464b",
	deleted: "#41464b",
};

const deploymentStatus = (upstream: Upstream) =>
	upstream.isDisabled ? "disabled" : upstream.nginxDeploymentStatus || "pending";

const deploymentLabel = (upstream: Upstream) =>
	intl.formatMessage({
		id: `nginx-deployment.status.${deploymentStatus(upstream)}`,
		defaultMessage: intl.formatMessage({ id: "nginx-deployment.status.pending" }),
	});

const requiresRepublish = (upstream: Upstream) => !upstream.isDisabled && deploymentStatus(upstream) !== "online";

const loadBalancingMethodLabel = (method: Upstream["loadBalancingMethod"]) =>
	intl.formatMessage({ id: `upstreams.method.${method}` });

export default function UpstreamsTable() {
	const queryClient = useQueryClient();
	const { data, isLoading, isError, error, isFetching } = useUpstreams();
	const [publishing, setPublishing] = useState<number | null>(null);

	if (isLoading) return <LoadingPage />;
	if (isError) return <Alert variant="danger">{error?.message || <T id="upstreams.error.unknown" />}</Alert>;

	const refresh = () => queryClient.invalidateQueries({ queryKey: ["upstreams"] });
	const handlePublish = async (id: number) => {
		setPublishing(id);
		try {
			await publishUpstream(id);
			showObjectSuccess("upstream", "saved");
			refresh();
		} catch (error) {
			showError((error as Error).message);
		} finally {
			setPublishing(null);
		}
	};

	return (
		<div className="card mt-4">
			<div className="card-status-top bg-blue" />
			<div className="card-header d-flex align-items-center">
				<div>
					<h2 className="mb-1">
						<T id="upstreams" />
					</h2>
					<div className="text-secondary small">
						<T id="upstreams.description" />
					</div>
				</div>
				<div className="ms-auto d-flex gap-2">
					<Button size="sm" onClick={refresh} disabled={isFetching}>
						<IconRefresh size={16} />
						<span className="visually-hidden">
							<T id="upstreams.refresh" />
						</span>
					</Button>
					<HasPermission section={UPSTREAMS} permission={MANAGE} hideError>
						<Button size="sm" className="btn-blue" onClick={() => showUpstreamModal("new")}>
							<IconPlus size={16} className="me-1" />
							<T id="upstreams.add" />
						</Button>
					</HasPermission>
				</div>
			</div>
			<div className="table-responsive">
				<table className="table table-vcenter card-table">
					<thead>
						<tr>
							<th>
								<T id="column.name" />
							</th>
							<th>
								<T id="upstreams.nginx-key" />
							</th>
							<th>
								<T id="upstreams.load-balancing-method" />
							</th>
							<th>
								<T id="upstreams.servers" />
							</th>
							<th>
								<span className="d-inline-flex align-items-center gap-1">
									<T id="nginx-deployment.status" />
									<OverlayTrigger
										trigger={["hover", "focus"]}
										placement="top"
										overlay={
											<Tooltip id="upstream-nginx-status-help">
												<T id="upstreams.nginx-status.help" />
											</Tooltip>
										}
									>
										<button
											type="button"
											className="btn btn-link btn-sm p-0 text-secondary"
											aria-label={intl.formatMessage({ id: "upstreams.nginx-status.help" })}
										>
											<IconHelpCircle size={16} stroke={1.8} aria-hidden="true" />
										</button>
									</OverlayTrigger>
								</span>
							</th>
							<th className="w-1" />
						</tr>
					</thead>
					<tbody>
						{!data?.length ? (
							<tr>
								<td colSpan={6} className="text-center text-secondary py-5">
									<T id="upstreams.none" />
								</td>
							</tr>
						) : (
							data.map((upstream) => (
								<tr key={upstream.id}>
									<td>
										<button
											type="button"
											className="btn btn-link p-0"
											onClick={() => showUpstreamModal(upstream.id)}
										>
											{upstream.name}
										</button>
									</td>
									<td>
										<code>{upstream.nginxKey}</code>
									</td>
									<td>{loadBalancingMethodLabel(upstream.loadBalancingMethod)}</td>
									<td>{upstream.servers?.length || 0}</td>
									<td>
										<span
											className="badge text-white fw-semibold"
											style={{
												backgroundColor:
													deploymentStatusColors[deploymentStatus(upstream)] ||
													deploymentStatusColors.pending,
											}}
										>
											{deploymentLabel(upstream)}
										</span>
									</td>
									<td>
										<HasPermission section={UPSTREAMS} permission={MANAGE} hideError>
											<div className="btn-list flex-nowrap">
												{requiresRepublish(upstream) && (
													<Button
														size="sm"
														onClick={() => handlePublish(upstream.id)}
														disabled={publishing === upstream.id}
													>
														<T id="upstreams.republish" />
													</Button>
												)}
												<Button size="sm" onClick={() => showUpstreamModal(upstream.id)}>
													<IconEdit size={16} />
													<span className="visually-hidden">
														<T id="object.edit" tData={{ object: "upstream" }} />
													</span>
												</Button>
												<Button
													size="sm"
													className="btn-outline-danger"
													onClick={() =>
														showDeleteConfirmModal({
															title: (
																<T id="object.delete" tData={{ object: "upstream" }} />
															),
															children: (
																<>
																	<T
																		id="upstreams.delete.content"
																		data={{ name: upstream.name }}
																	/>
																</>
															),
															onConfirm: async () => {
																await deleteUpstream(upstream.id);
																showObjectSuccess("upstream", "deleted");
															},
															invalidations: [["upstreams"], ["upstream", upstream.id]],
														})
													}
												>
													<IconTrash size={16} />
													<span className="visually-hidden">
														<T id="object.delete" tData={{ object: "upstream" }} />
													</span>
												</Button>
											</div>
										</HasPermission>
									</td>
								</tr>
							))
						)}
					</tbody>
				</table>
			</div>
		</div>
	);
}
