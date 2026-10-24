import { useState } from "react";
import { Alert } from "react-bootstrap";
import { Button, Loading } from "src/components";
import { useSSOSettings } from "src/hooks";
import { T } from "src/locale";
import AllowlistForm from "./AllowlistForm";
import ConnectionForm from "./ConnectionForm";
import PolicyForm from "./PolicyForm";

const errorMessages: Record<string, string> = {
	sso_revision_conflict: "settings.sso.revisionConflict",
	sso_invalid_configuration: "settings.sso.errorInvalidConfiguration",
	sso_key_restore_required: "settings.sso.errorKeyRestoreRequired",
	sso_configuration_unavailable: "settings.sso.errorUnavailable",
	sso_probe_failed: "settings.sso.errorProbeFailed",
	sso_oidc_probe_not_ready: "settings.sso.errorProbeNotReady",
	sso_oauth2_probe_not_ready: "settings.sso.errorProbeNotReady",
	sso_saml_probe_not_ready: "settings.sso.errorProbeNotReady",
	sso_protocol_unavailable: "settings.sso.errorProtocolUnavailable",
};

const errorMessageID = (error: unknown) =>
	error instanceof Error && errorMessages[error.message] ? errorMessages[error.message] : "settings.sso.errorGeneric";

export type SSOSection = "mode" | "connections" | "emails";

export const ssoSectionLabels: Record<SSOSection, string> = {
	mode: "settings.sso.mode",
	connections: "settings.sso.connections",
	emails: "settings.sso.allowlist",
};

export default function SSOSettings({ section }: { section: SSOSection }) {
	const settings = useSSOSettings();
	const [selectedID, setSelectedID] = useState<string>();
	const [adding, setAdding] = useState(false);
	const [message, setMessage] = useState<{ type: "danger" | "success"; id: string }>();
	const queries = [settings.policy, settings.allowlist, settings.connections, settings.legacyStatus];
	const busy =
		settings.updatePolicy.isPending ||
		settings.updateAllowlist.isPending ||
		settings.saveConnection.isPending ||
		settings.deleteConnection.isPending ||
		settings.testConnection.isPending ||
		settings.previewSAML.isPending ||
		settings.importLegacy.isPending;
	const selected = settings.connections.data?.find((connection) => connection.id === selectedID);

	const perform = async <T,>(operation: () => Promise<T>, success?: string) => {
		setMessage(undefined);
		try {
			const value = await operation();
			if (success) setMessage({ type: "success", id: success });
			return { ok: true as const, value };
		} catch (error) {
			if (error instanceof Error && error.message === "sso_revision_conflict") {
				await settings.refetchAll();
				setMessage({ type: "danger", id: "settings.sso.revisionConflict" });
				return { ok: false as const };
			}
			setMessage({ type: "danger", id: errorMessageID(error) });
			return { ok: false as const };
		}
	};

	if (queries.some((query) => query.isLoading)) {
		return (
			<div className="card-body">
				<Loading noLogo />
			</div>
		);
	}
	const queryError = queries.find((query) => query.error)?.error;
	if (queryError || !settings.policy.data || !settings.allowlist.data || !settings.connections.data) {
		return (
			<div className="card-body">
				<Alert variant="danger">
					<T id={errorMessageID(queryError)} />
				</Alert>
			</div>
		);
	}

	const editor =
		selected || adding ? (
			<ConnectionForm
				key={selected?.id || "new"}
				connection={selected}
				publicUrl={settings.policy.data.publicUrl}
				busy={busy}
				onSave={async (value) => {
					const result = await perform(
						() => settings.saveConnection.mutateAsync(value),
						"settings.sso.saved",
					);
					if (result.ok) setAdding(false);
					return result.ok;
				}}
				onDelete={async (value) => {
					const result = await perform(
						() => settings.deleteConnection.mutateAsync(value),
						"settings.sso.deleted",
					);
					if (result.ok) setSelectedID(undefined);
				}}
				onTest={async (id) => {
					await perform(() => settings.testConnection.mutateAsync(id), "settings.sso.testPassed");
				}}
				onPreview={async (config) => {
					const result = await perform(() => settings.previewSAML.mutateAsync(config));
					return result.ok ? result.value : undefined;
				}}
			/>
		) : null;

	return (
		<div className="card-body">
			<div className="d-flex align-items-center justify-content-between gap-3 mb-3">
				<h3 className="mb-0">
					<T id={ssoSectionLabels[section]} />
				</h3>
				{section === "connections" && (
					<Button
						onClick={() => {
							setAdding(true);
							setSelectedID(undefined);
						}}
					>
						<T id="settings.sso.add" />
					</Button>
				)}
			</div>
			{message && (
				<Alert variant={message.type} dismissible onClose={() => setMessage(undefined)}>
					<T id={message.id} />
				</Alert>
			)}
			{section === "mode" && (
				<PolicyForm
					policy={settings.policy.data}
					busy={busy}
					onSave={async (value) => {
						await perform(() => settings.updatePolicy.mutateAsync(value), "settings.sso.saved");
					}}
				/>
			)}

			{section === "connections" && (
				<section className="mb-3">
					<div className="d-flex flex-column gap-2">
						{adding && editor}
						{settings.connections.data.map((connection) => (
							<div key={connection.id}>
								<button
									type="button"
									className={`list-group-item list-group-item-action border rounded p-3 ${selectedID === connection.id ? "active" : ""}`}
									aria-expanded={selectedID === connection.id}
									onClick={() => {
										setSelectedID((current) =>
											current === connection.id ? undefined : connection.id,
										);
										setAdding(false);
									}}
								>
									<span className="fw-bold">{connection.name}</span>{" "}
									<span className="badge ms-2">{connection.protocol.toUpperCase()}</span>
									{!connection.enabled && (
										<span className="badge bg-secondary ms-2">
											<T id="settings.sso.disabled" />
										</span>
									)}
								</button>
								{selectedID === connection.id && editor}
							</div>
						))}
					</div>
				</section>
			)}

			{section === "emails" && (
				<AllowlistForm
					allowlist={settings.allowlist.data}
					busy={busy}
					onSave={async (value) => {
						await perform(() => settings.updateAllowlist.mutateAsync(value), "settings.sso.saved");
					}}
				/>
			)}

			{section === "connections" && settings.legacyStatus.data?.conversionAvailable && (
				<section className="mb-3">
					<div>
						<p>
							<T id="settings.sso.legacyDescription" />
						</p>
						<Button
							onClick={async () => {
								await perform(() => settings.importLegacy.mutateAsync(), "settings.sso.legacyImported");
								await settings.refetchAll();
							}}
							disabled={busy}
						>
							<T id="settings.sso.importLegacy" />
						</Button>
					</div>
				</section>
			)}
		</div>
	);
}
