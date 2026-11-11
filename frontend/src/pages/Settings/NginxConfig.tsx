import { IconAlertTriangle, IconCircleCheck, IconRefresh } from "@tabler/icons-react";
import { type MutationState, useMutation, useMutationState, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Alert } from "react-bootstrap";
import Modal from "react-bootstrap/Modal";
import {
	isApiError,
	type NginxHostType,
	type NginxRegenerateHost,
	type NginxRegenerateLocation,
	type NginxRegenerateResult,
	regenerateNginxConfigs,
} from "src/api/backend";
import { Button } from "src/components";
import { intl, T } from "src/locale";
import { showDeadHostModal, showProxyHostModal, showRedirectionHostModal, showStreamModal } from "src/modals";
import { formatApiError, formatNginxError } from "src/modules/HostStatus";

// Lists that show a host's status, refreshed after the configs were rewritten
const INVALIDATIONS = [
	"proxy-hosts",
	"proxy-host",
	"redirection-hosts",
	"redirection-host",
	"dead-hosts",
	"dead-host",
	"streams",
	"stream",
	"host-report",
	"upstream-health",
	"audit-logs",
];

// The run lives in the mutation cache, not in this component: leaving the section (or the page) while it runs
// keeps its progress and result, they show again when the section is opened again
const MUTATION_KEY = ["regenerate-nginx-configs"];

const HOST_TYPE_LABELS: Record<NginxHostType, string> = {
	proxy_host: "proxy-host",
	redirection_host: "redirection-host",
	dead_host: "dead-host",
	stream: "stream",
};

const hasMessage = (id: string) => typeof (intl.messages as Record<string, unknown> | undefined)?.[id] !== "undefined";

// Why an offline or failed host is listed: worded from its error details in the UI language, else the backend's text
const errorText = (host: NginxRegenerateHost) => formatNginxError(host.details) || host.error;

// Codes of a broken custom location that an existing text already says (the same as the host status popover's,
// see locationStatusText()): invalid_path is the editor's own check of the forward path, a rejected location is
// what the quarantined state means
const LOCATION_CHECK_KEYS: Record<string, string> = {
	invalid_path: "location.error.path-invalid",
	rejected: "location-status.quarantined.default",
};

// What is wrong with a broken custom location, in the UI language: location-check.<code> (or its state's default
// text), then nginx's error as it is on a line of its own; the backend's English message for a code without a text
const locationText = (location: NginxRegenerateLocation) => {
	const params = location.params || {};
	const detail = params.detail ? `\n${params.detail}` : "";
	const id = location.code ? LOCATION_CHECK_KEYS[location.code] || `location-check.${location.code}` : "";
	if (id && hasMessage(id)) {
		return `${intl.formatMessage({ id }, { host: params.host ?? "" })}${detail}`;
	}
	const fallback = `location-status.${location.status}.default`;
	if (!location.message && hasMessage(fallback)) {
		return `${intl.formatMessage({ id: fallback })}${detail}`;
	}
	return location.message || location.status;
};

const warningText = (host: NginxRegenerateHost) =>
	host.locations?.length ? host.locations.map((l) => `${l.path}: ${locationText(l)}`).join("\n") : host.message;

const openHost = (host: NginxRegenerateHost) => {
	switch (host.hostType) {
		case "proxy_host":
			return showProxyHostModal(host.id);
		case "redirection_host":
			return showRedirectionHostModal(host.id);
		case "dead_host":
			return showDeadHostModal(host.id);
		case "stream":
			return showStreamModal(host.id);
	}
};

interface HostListProps {
	titleId: string;
	hosts: NginxRegenerateHost[];
	text: (host: NginxRegenerateHost) => string | undefined;
	testId: string;
}
function HostList({ titleId, hosts, text, testId }: HostListProps) {
	if (!hosts.length) {
		return null;
	}
	return (
		<div className="mt-3" data-testid={testId}>
			<div className="fw-bold mb-1">
				<T id={titleId} data={{ count: hosts.length }} />
			</div>
			<ul className="list-unstyled mb-0">
				{hosts.map((host) => (
					<li key={`${host.hostType}-${host.id}`} className="mb-2">
						<span className="text-secondary me-1">
							<T id={HOST_TYPE_LABELS[host.hostType] || host.hostType} />
						</span>
						<button
							type="button"
							className="btn btn-link p-0 align-baseline"
							onClick={() => openHost(host)}
						>
							{host.name}
						</button>
						{text(host) ? (
							<div className="text-secondary small" style={{ whiteSpace: "pre-line" }}>
								{text(host)}
							</div>
						) : null}
					</li>
				))}
			</ul>
		</div>
	);
}

// The summary a failed run sends with its error, see error.regenerate_summary. Missing parts count as empty.
const partialResult = (error: unknown): NginxRegenerateResult | null => {
	if (!isApiError(error) || !error.regenerateSummary) {
		return null;
	}
	const raw = error.regenerateSummary;
	const list = (value: unknown) => (Array.isArray(value) ? (value as NginxRegenerateHost[]) : []);
	const count = (value: unknown) => (typeof value === "number" ? value : 0);
	return {
		checked: count(raw.checked),
		regenerated: count(raw.regenerated),
		offline: list(raw.offline),
		failed: list(raw.failed),
		warnings: list(raw.warnings),
		skipped: list(raw.skipped),
		durationMs: count(raw.durationMs),
	};
};

interface RegenerateResultProps {
	result: NginxRegenerateResult;
	// the run failed after it changed hosts, this is what it did until then
	partial?: boolean;
}
function RegenerateResult({ result, partial }: RegenerateResultProps) {
	const problems = result.offline.length + result.failed.length;
	const variant = partial || problems ? "warning" : result.warnings.length ? "info" : "success";
	return (
		<Alert
			variant={variant}
			className="mt-4 mb-0"
			data-testid={partial ? "regenerate-partial" : "regenerate-result"}
		>
			{partial ? (
				<div className="fw-bold mb-1">
					<T id="settings.nginx.regenerate.partial" />
				</div>
			) : null}
			<div className="d-flex align-items-center">
				{problems ? (
					<IconAlertTriangle size={20} className="me-2 flex-shrink-0" />
				) : (
					<IconCircleCheck size={20} className="me-2 flex-shrink-0" />
				)}
				<div>
					<T
						id="settings.nginx.regenerate.result"
						data={{
							checked: result.checked,
							regenerated: result.regenerated,
							offline: result.offline.length,
							failed: result.failed.length,
							// localised decimal separator
							seconds: intl.formatNumber(result.durationMs / 1000, {
								minimumFractionDigits: 1,
								maximumFractionDigits: 1,
							}),
						}}
					/>
				</div>
			</div>
			<HostList
				titleId="settings.nginx.regenerate.offline"
				hosts={result.offline}
				text={errorText}
				testId="regenerate-offline"
			/>
			<HostList
				titleId="settings.nginx.regenerate.failed"
				hosts={result.failed}
				text={errorText}
				testId="regenerate-failed"
			/>
			<HostList
				titleId="settings.nginx.regenerate.warnings"
				hosts={result.warnings}
				text={warningText}
				testId="regenerate-warnings"
			/>
			<HostList
				titleId="settings.nginx.regenerate.skipped"
				hosts={result.skipped ?? []}
				// the title says why, the backend's per-host text is the same in English
				text={() => undefined}
				testId="regenerate-skipped"
			/>
		</Alert>
	);
}

export default function NginxConfig() {
	const queryClient = useQueryClient();
	const [confirming, setConfirming] = useState(false);
	// submittedAt of the run whose error was dismissed
	const [dismissed, setDismissed] = useState<number | null>(null);

	const mutation = useMutation({
		mutationKey: MUTATION_KEY,
		mutationFn: () => regenerateNginxConfigs(),
		// Mutation level callback: runs even when this section was left meanwhile
		onSettled: () => {
			for (const key of INVALIDATIONS) {
				queryClient.invalidateQueries({ queryKey: [key] });
			}
		},
	});
	const runs = useMutationState<MutationState<NginxRegenerateResult, unknown>>({
		filters: { mutationKey: MUTATION_KEY },
		select: (m) => m.state as MutationState<NginxRegenerateResult, unknown>,
	});
	const latest = runs.length ? runs[runs.length - 1] : null;
	const running = latest?.status === "pending";
	const result = latest?.status === "success" ? (latest.data ?? null) : null;
	const error = latest?.status === "error" && latest.submittedAt !== dismissed ? formatApiError(latest.error) : null;
	// A failed run may have rewritten hosts or taken them offline already. Shown until the next run, also when
	// the error was dismissed, like the result of a successful run.
	const partial = latest?.status === "error" ? partialResult(latest.error) : null;

	const onRegenerate = () => {
		setConfirming(false);
		if (running) return;
		mutation.mutate();
	};

	return (
		<div className="card-body" data-testid="settings-nginx">
			<h3 className="card-title">
				<T id="settings.nginx.regenerate.title" />
			</h3>
			<p className="text-secondary">
				<T id="settings.nginx.regenerate.description" />
			</p>
			<Button
				actionType="primary"
				className="bg-teal"
				isLoading={running}
				disabled={running}
				onClick={() => setConfirming(true)}
			>
				<IconRefresh size={18} className="me-1" />
				<T id="settings.nginx.regenerate.button" />
			</Button>
			{running ? (
				<div className="text-secondary mt-3" data-testid="regenerate-running">
					<T id="settings.nginx.regenerate.running" />
				</div>
			) : null}
			{error ? (
				<Alert
					variant="danger"
					className="mt-4 mb-0"
					onClose={() => setDismissed(latest?.submittedAt ?? null)}
					dismissible
				>
					{error}
				</Alert>
			) : null}
			{result ? <RegenerateResult result={result} /> : null}
			{partial ? <RegenerateResult result={partial} partial /> : null}

			<Modal show={confirming} onHide={() => setConfirming(false)}>
				<Modal.Header closeButton>
					<Modal.Title>
						<T id="settings.nginx.regenerate.confirm-title" />
					</Modal.Title>
				</Modal.Header>
				<Modal.Body>
					<p>
						<T id="settings.nginx.regenerate.confirm-body" />
					</p>
					<p className="mb-0 text-secondary">
						<T id="settings.nginx.regenerate.confirm-offline" />
					</p>
				</Modal.Body>
				<Modal.Footer>
					<Button onClick={() => setConfirming(false)}>
						<T id="cancel" />
					</Button>
					<Button actionType="primary" className="ms-auto bg-teal" onClick={onRegenerate}>
						<T id="settings.nginx.regenerate.confirm-button" />
					</Button>
				</Modal.Footer>
			</Modal>
		</div>
	);
}
