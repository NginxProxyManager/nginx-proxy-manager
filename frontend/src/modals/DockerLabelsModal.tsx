import { IconBrandDocker, IconChevronDown, IconChevronRight, IconCopy, IconRefresh } from "@tabler/icons-react";
import cn from "classnames";
import EasyModal, { type InnerModalProps } from "ez-modal-react";
import { useState } from "react";
import { Alert } from "react-bootstrap";
import Modal from "react-bootstrap/Modal";
import type { UpstreamCandidate, UpstreamCandidates, UpstreamSuggestion } from "src/api/backend";
import { Button, Loading } from "src/components";
import { useUpstreamCandidates } from "src/hooks";
import { intl, T } from "src/locale";
import { showDeadHostModal } from "./DeadHostModal";
import { type ProxyHostPrefill, showProxyHostModal } from "./ProxyHostModal";
import { showRedirectionHostModal } from "./RedirectionHostModal";

export const COMPOSE_EXAMPLE = `services:
  whoami:
    image: traefik/whoami
    networks: [npm_default]  # a network Nginx Proxy Manager is on
    labels:
      npm.domain: "whoami.example.com, www.whoami.example.com"
      npm.port: "80"
      npm.scheme: "http"
      npm.websocket: "true"
      npm.block_exploits: "true"
networks:
  npm_default:
    external: true`;

export type LabelledContainer = UpstreamCandidate & { suggestion: UpstreamSuggestion };

/**
 * Containers with a label suggestion, split into those with an npm.domain label (one-click proxy host) and the
 * rest (only the target can be prefilled). Compose service aliases carry no suggestion, so every container is
 * listed once.
 */
export const splitLabelledContainers = (data?: UpstreamCandidates) => {
	const containers = (data?.items || []).filter(
		(item): item is LabelledContainer => item.source === "docker" && !!item.suggestion,
	);
	const byHost = (a: LabelledContainer, b: LabelledContainer) => a.host.localeCompare(b.host);
	return {
		labelled: containers.filter((c) => c.suggestion.domainNames.length > 0).sort(byHost),
		other: containers.filter((c) => c.suggestion.domainNames.length === 0).sort(byHost),
	};
};

/**
 * What the proxy host form starts with. Containers without npm.domain only prefill the target.
 * http2Support is only a wish here: a new host has no certificate, so the form turns HTTP/2 on once the user
 * picks one (see ProxyHostModal).
 */
export const suggestionPrefill = (s: UpstreamSuggestion): ProxyHostPrefill => {
	const target: ProxyHostPrefill = {
		forwardScheme: s.forwardScheme,
		forwardHost: s.forwardHost,
		...(s.forwardPort ? { forwardPort: s.forwardPort } : {}),
	};
	if (!s.domainNames.length) {
		return target;
	}
	return {
		...target,
		domainNames: [...s.domainNames],
		allowWebsocketUpgrade: s.allowWebsocketUpgrade,
		blockExploits: s.blockExploits,
		cachingEnabled: s.cachingEnabled,
		http2Support: s.http2Support,
	};
};

const showDockerLabelsModal = () => {
	EasyModal.show(DockerLabelsModal);
};

function StateBadge({ state }: { state: string | null }) {
	if (!state) {
		return null;
	}
	return (
		<span className={cn("badge", state === "running" ? "bg-green-lt" : "bg-secondary-lt")} data-testid="state">
			{state}
		</span>
	);
}

function Target({ s }: { s: UpstreamSuggestion }) {
	return (
		<code className="text-break">
			{s.forwardScheme}://{s.forwardHost}:
			{s.forwardPort ?? (
				<span className="text-warning" title={intl.formatMessage({ id: "docker-labels.no-port" })}>
					?
				</span>
			)}
		</code>
	);
}

function IgnoredDomains({ s }: { s: UpstreamSuggestion }) {
	if (!s.ignoredDomains?.length) {
		return null;
	}
	return (
		<div
			className="small text-warning text-break"
			title={intl.formatMessage({ id: "docker-labels.ignored-hint" })}
			data-testid="ignored-domains"
		>
			<T id="docker-labels.ignored" data={{ domains: s.ignoredDomains.join(", ") }} />
		</div>
	);
}

/**
 * Open instead of Create: the domain is taken. A proxy host is the one to edit; a redirection or 404 host has
 * to be changed (or removed) before a proxy host can use the domain, so say which one it is.
 */
function OpenExisting({ s, onOpen }: { s: UpstreamSuggestion; onOpen: ListProps["onOpen"] }) {
	const type = s.existingHostType || "proxy_host";
	return (
		<>
			<button
				type="button"
				className="btn btn-sm"
				title={intl.formatMessage({ id: "docker-labels.exists" }, { type })}
				onClick={() => onOpen(type, s.existingHostId as number)}
				data-testid="open-existing"
			>
				<T id="docker-labels.open" />
			</button>
			{type !== "proxy_host" ? (
				<div className="small text-warning text-wrap" data-testid="used-by">
					<T id="docker-labels.used-by" data={{ type }} />
				</div>
			) : null}
		</>
	);
}

function ComposeExample() {
	const [copied, setCopied] = useState(false);
	const copy = async () => {
		try {
			await navigator.clipboard.writeText(COMPOSE_EXAMPLE);
			setCopied(true);
			setTimeout(() => setCopied(false), 2000);
		} catch {
			// no clipboard access (http): the text can still be selected
		}
	};
	return (
		<div className="position-relative">
			<pre className="small mb-0" data-testid="compose-example">
				{COMPOSE_EXAMPLE}
			</pre>
			<button
				type="button"
				className="btn btn-sm position-absolute top-0 end-0 m-2"
				onClick={copy}
				data-testid="copy-compose-example"
			>
				<IconCopy size={14} className="me-1" />
				<T id={copied ? "docker-labels.copied" : "docker-labels.copy"} />
			</button>
		</div>
	);
}

export type ExistingHostType = NonNullable<UpstreamSuggestion["existingHostType"]>;

interface ListProps {
	data: UpstreamCandidates;
	onCreate: (prefill: ProxyHostPrefill) => void;
	onOpen: (type: ExistingHostType, id: number) => void;
}

/**
 * Containers that can become a proxy host. Without a working Docker provider (disabled, no access, or only
 * DNS discovery, which can't read labels) it says why instead.
 */
export function DockerLabelsList({ data, onCreate, onOpen }: ListProps) {
	const docker = data.providers?.docker;
	const { labelled, other } = splitLabelledContainers(data);
	// A container whose npm.domain had only unusable names lands in "Other": show it, with the reason
	const [showOther, setShowOther] = useState(() => other.some((c) => c.suggestion.ignoredDomains?.length));

	if (docker?.status !== "ok") {
		return (
			<Alert variant="warning" data-testid="docker-unavailable">
				<T id="docker-labels.unavailable" data={{ message: docker?.message || docker?.status || "-" }} />
			</Alert>
		);
	}

	return (
		<>
			{labelled.length ? (
				<>
					<p className="text-secondary">
						<T id="docker-labels.intro" />
					</p>
					<div className="table-responsive">
						<table className="table table-vcenter card-table" data-testid="labelled-containers">
							<thead>
								<tr>
									<th>
										<T id="domain-names" />
									</th>
									<th>
										<T id="column.destination" />
									</th>
									<th />
									<th />
								</tr>
							</thead>
							<tbody>
								{labelled.map((c) => (
									<tr key={c.host} data-testid={`labelled-${c.host}`}>
										<td className="text-break">
											{c.suggestion.domainNames.map((d) => (
												<div key={d}>{d}</div>
											))}
											<IgnoredDomains s={c.suggestion} />
										</td>
										<td>
											<Target s={c.suggestion} />
											<div className="small text-secondary">{c.host}</div>
										</td>
										<td>
											<StateBadge state={c.state} />
										</td>
										<td className="text-end text-nowrap">
											{c.suggestion.existingHostId ? (
												<OpenExisting s={c.suggestion} onOpen={onOpen} />
											) : (
												<button
													type="button"
													className="btn btn-sm btn-lime"
													onClick={() => onCreate(suggestionPrefill(c.suggestion))}
												>
													<T id="docker-labels.create" />
												</button>
											)}
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				</>
			) : (
				<div data-testid="docker-labels-empty">
					<p>
						<T id="docker-labels.empty" />
					</p>
					<ComposeExample />
				</div>
			)}
			{other.length ? (
				<div className="mt-3">
					<button
						type="button"
						className="btn btn-link p-0 text-secondary"
						aria-expanded={showOther}
						onClick={() => setShowOther(!showOther)}
						data-testid="toggle-other-containers"
					>
						{showOther ? <IconChevronDown size={16} /> : <IconChevronRight size={16} />}
						<T id="docker-labels.other" data={{ count: other.length }} />
					</button>
					{showOther ? (
						<>
							<div className="small text-secondary mt-1">
								<T id="docker-labels.other-hint" />
							</div>
							<table className="table table-sm table-vcenter mt-2" data-testid="other-containers">
								<tbody>
									{other.map((c) => (
										<tr key={c.host} data-testid={`other-${c.host}`}>
											<td>
												<Target s={c.suggestion} />
												<IgnoredDomains s={c.suggestion} />
											</td>
											<td>
												<StateBadge state={c.state} />
											</td>
											<td className="text-end">
												<button
													type="button"
													className="btn btn-sm"
													onClick={() => onCreate(suggestionPrefill(c.suggestion))}
												>
													<T id="docker-labels.create" />
												</button>
											</td>
										</tr>
									))}
								</tbody>
							</table>
						</>
					) : null}
				</div>
			) : null}
		</>
	);
}

interface Props extends InnerModalProps {}
const DockerLabelsModal = EasyModal.create(({ visible, remove }: Props) => {
	const { data, isFetching, error, refresh, isRefreshing } = useUpstreamCandidates(true, {
		// existing_host_id changes as soon as a host is saved: always fetch fresh when the list opens
		staleTime: 0,
		refetchOnMount: "always",
	});

	const create = (prefill: ProxyHostPrefill) => {
		remove();
		showProxyHostModal("new", prefill);
	};
	const open = (type: ExistingHostType, id: number) => {
		remove();
		if (type === "redirection_host") {
			showRedirectionHostModal(id);
		} else if (type === "dead_host") {
			showDeadHostModal(id);
		} else {
			showProxyHostModal(id);
		}
	};

	return (
		<Modal show={visible} onHide={remove} size="lg" scrollable>
			<Modal.Header closeButton>
				<Modal.Title>
					<IconBrandDocker size={22} className="me-2 text-blue" />
					<T id="docker-labels.title" />
				</Modal.Title>
			</Modal.Header>
			<Modal.Body>
				{isFetching ? <Loading noLogo /> : null}
				{error ? <Alert variant="danger">{error.message}</Alert> : null}
				{/* cached data may be stale (Create where Open is right): wait for the fetch on open */}
				{data && !isFetching ? <DockerLabelsList data={data} onCreate={create} onOpen={open} /> : null}
			</Modal.Body>
			<Modal.Footer>
				<button
					type="button"
					className="btn btn-link me-auto"
					onClick={() => refresh()}
					disabled={isRefreshing}
					data-testid="refresh-docker-labels"
				>
					<IconRefresh size={16} className="me-1" />
					<T id="upstream.refresh" />
				</button>
				<Button type="button" actionType="primary" className="btn-lime" onClick={remove}>
					<T id="action.close" />
				</Button>
			</Modal.Footer>
		</Modal>
	);
});

export { showDockerLabelsModal };
