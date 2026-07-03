import { IconHelp, IconSearch } from "@tabler/icons-react";
import { useState } from "react";
import Alert from "react-bootstrap/Alert";
import { deleteCredential, migrateLegacyCredentials } from "src/api/backend";
import { Button, HasPermission, LoadingPage } from "src/components";
import CredentialsTable from "src/pages/Credentials/Table";
import { useCredentials } from "src/hooks";
import { T } from "src/locale";
import { showCredentialModal, showDeleteConfirmModal, showHelpModal } from "src/modals";
import { CREDENTIALS, MANAGE } from "src/modules/Permissions";
import { showObjectSuccess } from "src/notifications";

export default function DnsCredentials() {
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

	if (isLoading) return <LoadingPage noLogo />;
	if (isError) return <Alert variant="danger">{error?.message || "Unknown error"}</Alert>;

	const filtered =
		search && data
			? data.filter((item) => item.name.toLowerCase().includes(search) || item.dnsProvider.includes(search))
			: data;

	return (
		<div className="card-body">
			<div className="d-flex flex-wrap align-items-start justify-content-between gap-2 mb-3">
				<div>
					<h3 className="card-title mb-1">
						<T id="credentials" />
					</h3>
					<p className="text-muted small mb-0">
						<T id="credentials.subtitle" />
					</p>
				</div>
				<div className="d-flex flex-wrap btn-list">
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
					<Button size="sm" onClick={() => showHelpModal("Credentials", "teal")}>
						<IconHelp size={20} />
					</Button>
					<HasPermission section={CREDENTIALS} permission={MANAGE} hideError>
						<Button size="sm" variant="outline" actionType="secondary" onClick={() => handleMigrate(true)}>
							<T id="credentials.migrate" /> (preview)
						</Button>
						<Button size="sm" variant="outline" actionType="warning" onClick={() => handleMigrate(false)}>
							<T id="credentials.migrate" />
						</Button>
						<Button size="sm" className="btn-cyan" onClick={() => showCredentialModal()}>
							<T id="object.add" tData={{ object: "credential" }} />
						</Button>
					</HasPermission>
				</div>
			</div>
			{migrateMsg ? (
				<Alert variant="info" className="mb-3">
					{migrateMsg}
				</Alert>
			) : null}
			<CredentialsTable
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
	);
}
