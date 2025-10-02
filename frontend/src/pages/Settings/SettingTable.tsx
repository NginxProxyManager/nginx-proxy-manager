import { IconDotsVertical, IconEdit, IconPower, IconTrash } from "@tabler/icons-react";
import { T } from "src/locale";

export default function SettingTable() {
	return (
		<div className="card mt-4">
			<div className="card-status-top bg-teal" />
			<div className="card-table">
				<div className="card-header">
					<div className="row w-full">
						<h2 className="mt-1 mb-0">
							<T id="settings.title" />
						</h2>
					</div>
				</div>
				<div id="advanced-table">
					<div className="table-responsive">
						<table className="table table-vcenter table-selectable">
							<thead>
								<tr>
									<th className="w-1" />
									<th>
										<button type="button" className="table-sort d-flex justify-content-between">
											Source
										</button>
									</th>
									<th>
										<button type="button" className="table-sort d-flex justify-content-between">
											Destination
										</button>
									</th>
									<th>
										<button type="button" className="table-sort d-flex justify-content-between">
											SSL
										</button>
									</th>
									<th>
										<button type="button" className="table-sort d-flex justify-content-between">
											Access
										</button>
									</th>
									<th>
										<button type="button" className="table-sort d-flex justify-content-between">
											Status
										</button>
									</th>
									<th className="w-1" />
								</tr>
							</thead>
							<tbody className="table-tbody">
								<tr>
									<td data-label="Owner">
										<div className="d-flex py-1 align-items-center">
											<span
												className="avatar avatar-2 me-2"
												style={{
													backgroundImage:
														"url(//www.gravatar.com/avatar/6193176330f8d38747f038c170ddb193?default=mm)",
												}}
											/>
										</div>
									</td>
									<td data-label="Destination">
										<div className="flex-fill">
											<div className="font-weight-medium">
												<span className="badge badge-lg domain-name">blog.jc21.com</span>
											</div>
											<div className="text-secondary mt-1">Created: 20th September 2024</div>
										</div>
									</td>
									<td data-label="Source">http://172.17.0.1:3001</td>
									<td data-label="SSL">Let's Encrypt</td>
									<td data-label="Access">Public</td>
									<td data-label="Status">
										<span className="badge bg-lime-lt">Online</span>
									</td>
									<td data-label="Status" className="text-end">
										<span className="dropdown">
											<button
												type="button"
												className="btn dropdown-toggle btn-action btn-sm px-1"
												data-bs-boundary="viewport"
												data-bs-toggle="dropdown"
											>
												<IconDotsVertical />
											</button>
											<div className="dropdown-menu dropdown-menu-end">
												<span className="dropdown-header">Proxy Host #2</span>
												<a className="dropdown-item" href="#">
													<IconEdit size={16} />
													Edit
												</a>
												<a className="dropdown-item" href="#">
													<IconPower size={16} />
													Disable
												</a>
												<div className="dropdown-divider" />
												<a className="dropdown-item" href="#">
													<IconTrash size={16} />
													Delete
												</a>
											</div>
										</span>
									</td>
								</tr>
							</tbody>
						</table>
					</div>
				</div>
			</div>
		</div>
	);
}
