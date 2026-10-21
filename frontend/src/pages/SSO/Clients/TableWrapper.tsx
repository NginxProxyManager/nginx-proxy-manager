import { useQueryClient } from "@tanstack/react-query";
import Alert from "react-bootstrap/Alert";
import { deleteSingleSignOnClient, SingleSignOnClientType, toggleSingleSignOnClient } from "src/api/backend";
import { Button, LoadingPage } from "src/components";
import { useSingleSignOnClients, useUser } from "src/hooks";
import { T } from "src/locale";
import { showDeleteConfirmModal, showSingleSignOnClientModal } from "src/modals";
import { showObjectSuccess } from "src/notifications";
import Table from "./Table";

export default function TableWrapper() {
	const queryClient = useQueryClient();
	const { isFetching, isLoading, isError, error, data } = useSingleSignOnClients();
	const { data: currentUser } = useUser("me");

	if (isLoading) {
		return <LoadingPage />;
	}

	if (isError) {
		return <Alert variant="danger">{error?.message || "Unknown error"}</Alert>;
	}

	const handleDelete = async (id: number) => {
		await deleteSingleSignOnClient(id);
		showObjectSuccess("sso-client", "deleted");
	};

	const handleDisableToggle = async (id: number, enabled: boolean) => {
		await toggleSingleSignOnClient(id, enabled);
		queryClient.invalidateQueries({ queryKey: ["sso-clients"] });
		queryClient.invalidateQueries({ queryKey: ["sso-client", id] });
		showObjectSuccess("sso-client", enabled ? "enabled" : "disabled");
	};

	return (
		<div className="card mt-4">
			<div className="card-status-top bg-teal" />
			<div className="card-table">
				<div className="card-header">
					<div className="row w-full">
						<div className="col">
							<h2 className="mt-1 mb-0">
								<T id="single-sign-on" />
							</h2>
						</div>
						{data?.length ? (
							<div className="col-md-auto col-sm-12">
								<div className="ms-auto d-flex flex-wrap btn-list">
									<Button
										size="sm"
										className="py-2 btn-teal"
										onClick={() =>
											showSingleSignOnClientModal("new_openid", SingleSignOnClientType.OpenID)
										}
									>
										<T id="object.add" tData={{ object: "sso-client-oauth2-openid" }} />
									</Button>

									<Button
										size="sm"
										className="py-2 btn-teal"
										onClick={() =>
											showSingleSignOnClientModal("new_saml", SingleSignOnClientType.SAML)
										}
									>
										<T id="object.add" tData={{ object: "sso-client-saml" }} />
									</Button>
								</div>
							</div>
						) : null}
					</div>
				</div>
				<Table
					data={data ?? []}
					isFetching={isFetching}
					currentUserId={currentUser?.id}
					onEdit={(id: number, type: SingleSignOnClientType) => showSingleSignOnClientModal(id, type)}
					onNew={() => showSingleSignOnClientModal("new_openid", SingleSignOnClientType.OpenID)}
					onDelete={(id: number) =>
						showDeleteConfirmModal({
							title: <T id="object.delete" tData={{ object: "sso-client" }} />,
							onConfirm: () => handleDelete(id),
							invalidations: [["sso-clients"], ["sso-client", id]],
							children: <T id="object.delete.content" tData={{ object: "sso-client" }} />,
						})
					}
					onDisableToggle={handleDisableToggle}
				/>
			</div>
		</div>
	);
}
