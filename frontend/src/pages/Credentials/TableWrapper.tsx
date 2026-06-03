import { IconHelp, IconSearch } from "@tabler/icons-react";
import { useState } from "react";
import Alert from "react-bootstrap/Alert";
import { deleteCredential, migrateLegacyCredentials } from "src/api/backend";
import { Button, HasPermission, LoadingPage } from "src/components";
import { useCredentials } from "src/hooks";
import { T } from "src/locale";
import { showCredentialModal, showDeleteConfirmModal, showHelpModal } from "src/modals";
import { CREDENTIALS, MANAGE } from "src/modules/Permissions";
import { showObjectSuccess } from "src/notifications";
import Table from "./Table";

export default function TableWrapper() {
	const [search, setSearch] = useState("");
	const [migrateMsg, setMigrateMsg] = useState<string | null>(null);
	const { isFetching, isLoading, isError, error, data } = useCredentials();

	const handleMigrate = async (dryRun: boolean) => {
		setMigrateMsg(null);
		try {
			const result = await migrateLegacyCredentials(dryRun);
			setMigrateMsg(
				dryRun
					? `Dry run: ${result.count} certificate(s) eligible`
					: `Migrated ${result.count} certificate(s)`,
			);
		} catch (e: any) {
			setMigrateMsg(e.message);
		}
	};

	if (isLoading) return <LoadingPage />;
	if (isError) return <Alert variant="danger">{error?.message || "Unknown error"}</Alert>;

	const filtered =
		search && data
			? data.filter((item) => item.name.toLowerCase().includes(search) || item.dnsProvider.includes(search))
			: data;

	return (
		<div className="card mt-4">
			<div className="card-status-top bg-cyan" />
			<div className="card-table">
				<div className="card-header">
					<div className="row w-full">
						<div className="col">
							<h2 className="mt-1 mb-0">
								<T id="credentials" />
							</h2>
							<p className="text-muted small mb-0">
								<T id="credentials.subtitle" />
							</p>
						</div>
						<div className="col-md-auto col-sm-12">
							<div className="ms-auto d-flex flex-wrap btn-list">
								{data?.length ? (
									<div className="input-group input-group-flat w-auto">
										<span className="input-group-text input-group-text-sm">
											<IconSearch size={16} />
										</span>
										<input
											type="text"
											className="form-control form-control-sm"
											onChange={(e) => setSearch(e.target.value.toLowerCase().trim())}
										/>
									</div>
								) : null}
								<Button size="sm" onClick={() => showHelpModal("Credentials", "cyan")}>
									<IconHelp size={20} />
								</Button>
								<HasPermission section={CREDENTIALS} permission={MANAGE} hideError>
									<Button size="sm" variant="outline-secondary" onClick={() => handleMigrate(true)}>
										<T id="credentials.migrate" /> (preview)
									</Button>
									<Button size="sm" variant="outline-warning" onClick={() => handleMigrate(false)}>
										<T id="credentials.migrate" />
									</Button>
									<Button size="sm" className="btn-cyan" onClick={() => showCredentialModal()}>
										<T id="object.add" tData={{ object: "credential" }} />
									</Button>
								</HasPermission>
							</div>
						</div>
					</div>
				</div>
				{migrateMsg ? (
					<div className="px-3 pb-0">
						<Alert variant="info" className="mb-0">
							{migrateMsg}
						</Alert>
					</div>
				) : null}
				<Table
					data={filtered ?? []}
					isFetching={isFetching}
					isFiltered={!!search}
					onEdit={(item) => showCredentialModal(item)}
					onDelete={(id) =>
						showDeleteConfirmModal({
							title: <T id="object.delete" tData={{ object: "credential" }} />,
							onConfirm: async () => {
								await deleteCredential(id);
								showObjectSuccess("credential", "deleted");
							},
							invalidations: [["credentials"]],
							children: <T id="object.delete.content" tData={{ object: "credential" }} />,
						})
					}
					onNew={() => showCredentialModal()}
				/>
			</div>
		</div>
	);
}
