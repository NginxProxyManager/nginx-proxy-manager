import { IconBrandDocker, IconHelp, IconHistory, IconNetwork, IconRefresh, IconWorld } from "@tabler/icons-react";
import cn from "classnames";
import {
	createContext,
	type KeyboardEvent,
	type ReactNode,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import {
	type ActionMeta,
	components,
	createFilter,
	type GroupBase,
	type InputProps,
	type MenuListProps,
	type OptionProps,
	type SingleValue,
} from "react-select";
import CreatableSelect from "react-select/creatable";
import type { UpstreamCandidate, UpstreamCandidates, UpstreamSource, UpstreamSuggestion } from "src/api/backend";
import { useUpstreamCandidates } from "src/hooks";
import { intl, T } from "src/locale";
import { showHelpModal } from "src/modals";
import {
	candidateKindText,
	containerStateText,
	dockerErrorText,
	formatValueList,
	type ProviderErrorText,
} from "src/modules/UpstreamText";

export interface UpstreamOption {
	readonly value: string;
	readonly label: string;
	readonly candidate?: UpstreamCandidate;
	// react-select sets this on the synthetic "create" option
	readonly __isNew__?: boolean;
}

export interface UpstreamPrefill {
	port?: number;
	scheme?: "http" | "https";
}

const SOURCE_ORDER: UpstreamSource[] = ["docker", "dns", "history"];

const SOURCE_ICON: Record<UpstreamSource, ReactNode> = {
	docker: <IconBrandDocker size={14} className="text-blue" />,
	dns: <IconNetwork size={14} className="text-teal" />,
	history: <IconHistory size={14} className="text-secondary" />,
};

/** Port and scheme to fill in when a candidate is picked */
export const candidatePrefill = (c: UpstreamCandidate, currentHost?: string | null): UpstreamPrefill => {
	const prefill: UpstreamPrefill = {};
	if (typeof c.hintPort === "number" && c.hintPort > 0) {
		prefill.port = c.hintPort;
	} else if (c.ports?.length === 1) {
		prefill.port = c.ports[0];
	}
	if (c.hintScheme === "http" || c.hintScheme === "https") {
		prefill.scheme = c.hintScheme;
	} else if (prefill.port !== undefined && c.source === "docker" && c.host !== `${currentHost ?? ""}`.trim()) {
		// A container port without a scheme hint (no npm.scheme label) serves http unless it is 443/8443: picking
		// it must not keep the https of the target it replaces. Only together with the port: a container with
		// several ports and no hint leaves both fields alone (editing https:443 must not become http:443).
		// Picking the current host again changes nothing, it may serve TLS on another port. DNS and history
		// candidates don't say.
		prefill.scheme = prefill.port === 443 || prefill.port === 8443 ? "https" : "http";
	}
	return prefill;
};

/** react-select option groups, one per source, in a fixed order, empty ones left out */
export const groupCandidates = (items: UpstreamCandidate[] = []): GroupBase<UpstreamOption>[] =>
	SOURCE_ORDER.map((source) => ({
		label: intl.formatMessage({ id: `upstream.group.${source}` }),
		options: items.filter((c) => c.source === source).map((c) => ({ value: c.host, label: c.host, candidate: c })),
	})).filter((g) => g.options.length > 0);

/**
 * What typing filters the options by: the host name, and for a compose service alias its container's name,
 * for a host on a network that network's name (both are shown on the option)
 */
export const optionFilterText = (option: { label: string; value: string; data: UpstreamOption }): string => {
	const c = option.data.candidate;
	return [option.label, option.value, c?.owner, c?.network].filter(Boolean).join(" ");
};

/**
 * What a pick writes into the port and scheme fields. `null` empties the port: the new candidate has no port to
 * offer, and the one in the field came from an earlier pick.
 */
export interface PrefillChange {
	port?: number | null;
	scheme?: "http" | "https";
}

/**
 * The port and scheme of a prefill that may actually be written: only fields
 * that are empty, still hold their saved (initial) value, or still hold what an
 * earlier pick filled in. A port or scheme the user set themselves is kept.
 * When the new candidate has no port or scheme but the field still holds what an
 * earlier pick filled in, that is reset to the saved value (scheme: http, port:
 * empty when there is none), so it doesn't stay with a different target.
 */
export const allowedPrefill = (
	prefill: UpstreamPrefill,
	current: { port?: unknown; scheme?: unknown },
	initial: { port?: unknown; scheme?: unknown },
	previous: UpstreamPrefill = {},
): PrefillChange => {
	const same = (a: unknown, b: unknown) => typeof b !== "undefined" && b !== null && `${a}` === `${b}`;
	const isEmpty = (c: unknown) => c === undefined || c === null || c === "";
	const isFree = (key: "port" | "scheme") => {
		const c = current[key];
		return isEmpty(c) || same(c, initial[key]) || same(c, previous[key]);
	};
	// still what an earlier pick filled in, and not the saved value
	const isLeftOver = (key: "port" | "scheme") =>
		!isEmpty(current[key]) && same(current[key], previous[key]) && !same(current[key], initial[key]);
	const result: PrefillChange = {};
	if (prefill.port && isFree("port")) {
		result.port = prefill.port;
	} else if (!prefill.port && isLeftOver("port")) {
		const p = Number(initial.port);
		result.port = Number.isInteger(p) && p > 0 ? p : null;
	}
	if (prefill.scheme && isFree("scheme")) {
		result.scheme = prefill.scheme;
	} else if (!prefill.scheme && isLeftOver("scheme")) {
		result.scheme = initial.scheme === "https" ? "https" : "http";
	}
	return result;
};

/** `allowedPrefill` that remembers what it filled in, so a later pick may replace it */
export function usePrefillGuard() {
	const previous = useRef<UpstreamPrefill>({});
	return useCallback(
		(
			prefill: UpstreamPrefill,
			current: { port?: unknown; scheme?: unknown },
			initial: { port?: unknown; scheme?: unknown },
		) => {
			const result = allowedPrefill(prefill, current, initial, previous.current);
			const next: UpstreamPrefill = { ...previous.current };
			if (result.port) next.port = result.port;
			else if (result.port === null) delete next.port;
			if (result.scheme) next.scheme = result.scheme;
			previous.current = next;
			return result;
		},
		[],
	);
}

// The proxy host switches a container's npm.* labels can turn on
export type LabelToggle = "allowWebsocketUpgrade" | "blockExploits" | "cachingEnabled";
export const LABEL_TOGGLES: readonly LabelToggle[] = ["allowWebsocketUpgrade", "blockExploits", "cachingEnabled"];

export type ExistingHostType = NonNullable<UpstreamSuggestion["existingHostType"]>;

export interface ExistingHost {
	id: number;
	type: ExistingHostType;
}

/** A host that already serves one of the label's domains, other than the one being edited */
export const existingHostOf = (s: UpstreamSuggestion | undefined, hostId?: number | null): ExistingHost | null => {
	if (!s?.existingHostId) return null;
	const type = s.existingHostType || "proxy_host";
	if (type === "proxy_host" && hostId && s.existingHostId === hostId) return null;
	return { id: s.existingHostId, type };
};

/** What picking a labelled container fills in on a proxy host, besides the port and scheme */
export interface LabelPrefill {
	domainNames?: string[];
	toggles: Partial<Record<LabelToggle, boolean>>;
	// npm.http2: turned on once a certificate is picked (a new host has none, and HTTP/2 needs one)
	http2Support?: boolean;
	// the label's domains are taken: not filled in
	existingHost: ExistingHost | null;
	// the domains of the npm.domain label
	labelDomains: string[];
	// npm.domain entries the domain names field would refuse
	ignoredDomains: string[];
}

export interface LabelPrefillForm {
	// a host that isn't saved yet: only then are domains and switches filled in
	isNew: boolean;
	domainNames?: unknown;
	// switches the user changed in the form
	touched: ReadonlySet<string>;
}

const domainList = (v: unknown): string[] => (Array.isArray(v) ? v.map((d) => `${d}`.trim()).filter(Boolean) : []);
const sameDomains = (a: string[], b: string[]) => {
	const x = a.map((d) => d.toLowerCase()).sort();
	const y = b.map((d) => d.toLowerCase()).sort();
	return x.length === y.length && x.every((d, i) => d === y[i]);
};

/**
 * The domain names and switches a container's labels fill into a proxy host form. Only free fields are
 * filled: the domain names when the field is empty (or still holds what an earlier pick filled in, which is
 * cleared when this container has no usable domains) and none of the label's domains already has a host, the
 * switches when the user hasn't changed them. A candidate without labels (a DNS or history entry) counts as a
 * container with no labels: it drops the domains an earlier pick filled in and turns the untouched switches
 * off again. A host that is being edited keeps its domains and switches.
 */
export const labelPrefill = (
	s: UpstreamSuggestion | undefined,
	form: LabelPrefillForm,
	previousDomains: string[] = [],
): LabelPrefill => {
	const none: LabelPrefill = { toggles: {}, existingHost: null, labelDomains: [], ignoredDomains: [] };
	if (!form.isNew) return none;
	const existingHost = existingHostOf(s);
	const labelDomains = s?.domainNames || [];
	const current = domainList(form.domainNames);
	const fromEarlierPick = current.length > 0 && previousDomains.length > 0 && sameDomains(current, previousDomains);
	const result: LabelPrefill = {
		...none,
		existingHost,
		labelDomains: [...labelDomains],
		ignoredDomains: [...(s?.ignoredDomains || [])],
	};
	if (labelDomains.length && !existingHost && (!current.length || fromEarlierPick)) {
		result.domainNames = [...labelDomains];
	} else if (fromEarlierPick) {
		// another container's domains: they don't belong to this one
		result.domainNames = [];
	}
	for (const key of LABEL_TOGGLES) {
		if (!form.touched.has(key)) result.toggles[key] = !!s?.[key];
	}
	result.http2Support = !!s?.http2Support;
	return result;
};

/** `labelPrefill` that remembers the domains it filled in, so a later pick may replace them */
export function useLabelPrefill() {
	const previous = useRef<string[]>([]);
	return useCallback((s: UpstreamSuggestion | undefined, form: LabelPrefillForm) => {
		const result = labelPrefill(s, form, previous.current);
		if (result.domainNames) previous.current = result.domainNames;
		return result;
	}, []);
}

interface LabelHintProps {
	prefill: LabelPrefill | null;
	onOpen: (host: ExistingHost) => void;
}

/**
 * Under the domain names after a labelled container was picked: why its domains weren't filled in (another
 * host has them; a proxy host can be opened instead, a redirection or 404 host has to be changed first), and
 * the npm.domain entries that were left out.
 */
export function LabelPrefillHint({ prefill, onOpen }: LabelHintProps) {
	if (!prefill || (!prefill.existingHost && !prefill.ignoredDomains.length)) return null;
	const existing = prefill.existingHost;
	return (
		<div className="small mt-n2 mb-3" data-testid="label-hint">
			{existing ? (
				<div className="text-warning" data-testid="label-existing-host">
					{/* a redirection or 404 host: "used by ...: change or remove it first" */}
					<T
						id={existing.type === "proxy_host" ? "docker-labels.exists" : "docker-labels.used-by"}
						data={{ type: existing.type }}
					/>{" "}
					<T id="docker-labels.not-filled" data={{ domains: formatValueList(prefill.labelDomains) }} />{" "}
					<button
						type="button"
						className="btn btn-link btn-sm p-0 align-baseline"
						onClick={() => onOpen(existing)}
						data-testid="open-existing"
					>
						<T id="action.edit" />
					</button>
				</div>
			) : null}
			{prefill.ignoredDomains.length ? (
				<div
					className="text-warning text-break"
					title={intl.formatMessage({ id: "docker-labels.ignored-hint" })}
					data-testid="ignored-domains"
				>
					<T id="docker-labels.ignored" data={{ domains: formatValueList(prefill.ignoredDomains) }} />
				</div>
			) : null}
		</div>
	);
}

/**
 * Home / End in the host input: moves the caret to the start / end, or with
 * Shift extends the selection from its anchor, as the browser would.
 */
export const moveCaret = (input: HTMLInputElement | null, toStart: boolean, extend: boolean) => {
	if (!input || typeof input.setSelectionRange !== "function") return;
	const len = input.value.length;
	const target = toStart ? 0 : len;
	if (!extend) {
		input.setSelectionRange(target, target);
		return;
	}
	const start = input.selectionStart ?? 0;
	const end = input.selectionEnd ?? start;
	const anchor = input.selectionDirection === "backward" ? end : start;
	if (target < anchor) {
		input.setSelectionRange(target, anchor, "backward");
	} else {
		input.setSelectionRange(anchor, target, "forward");
	}
};

// Whether the user moved through the options with the keyboard since the last
// keystroke. Only then is an option highlighted and does Enter pick it;
// react-select would otherwise focus the first option and Enter (or Tab) would
// replace what was typed with it.
const NavigatedContext = createContext(false);

// Called right before an option is picked by a click, so the pick is allowed
const OptionClickContext = createContext<() => void>(() => {});

// Set for a proxy host's forward host: options show the domains of their npm.domain label and whether
// another host already has them. `hostId` is the host being edited, which may have them itself.
interface LabelInfo {
	hostId?: number | null;
}
const LabelInfoContext = createContext<LabelInfo | null>(null);

function OptionLabels({ s }: { s: UpstreamSuggestion }) {
	const info = useContext(LabelInfoContext);
	if (!info || !s.domainNames.length) return null;
	return (
		<div className="text-secondary small ps-3 text-break" data-testid="option-domains">
			<IconWorld size={12} className="me-1" />
			{formatValueList(s.domainNames)}
		</div>
	);
}

function OptionIgnored({ s }: { s: UpstreamSuggestion }) {
	const info = useContext(LabelInfoContext);
	if (!info || !s.ignoredDomains?.length) return null;
	return (
		<div
			className="text-warning small ps-3 text-break"
			title={intl.formatMessage({ id: "docker-labels.ignored-hint" })}
			data-testid="option-ignored-domains"
		>
			<T id="docker-labels.ignored" data={{ domains: formatValueList(s.ignoredDomains) }} />
		</div>
	);
}

function ExistingHostBadge({ s }: { s: UpstreamSuggestion }) {
	const info = useContext(LabelInfoContext);
	const existing = info ? existingHostOf(s, info.hostId) : null;
	if (!existing) return null;
	return (
		<span
			className="badge bg-yellow-lt ms-2 text-nowrap"
			title={intl.formatMessage({ id: "docker-labels.exists" }, { type: existing.type })}
			data-testid="existing-host-badge"
			data-type={existing.type}
		>
			<T id="docker-labels.badge" />
		</span>
	);
}

const Option = (props: OptionProps<UpstreamOption, false, GroupBase<UpstreamOption>>) => {
	const navigated = useContext(NavigatedContext);
	const allowClick = useContext(OptionClickContext);
	const c = props.data.candidate;
	const isFocused = props.isFocused && navigated;
	const { onClick } = props.innerProps;
	const innerProps = {
		...props.innerProps,
		onClick: onClick
			? (e: Parameters<typeof onClick>[0]) => {
					allowClick();
					onClick(e);
				}
			: undefined,
	};
	if (!c) {
		return <components.Option {...props} innerProps={innerProps} isFocused={isFocused} />;
	}
	const extra = [
		c.ports?.length ? intl.formatMessage({ id: "upstream.ports" }, { ports: formatValueList(c.ports) }) : null,
		c.network ? intl.formatMessage({ id: "upstream.network" }, { network: c.network }) : null,
		c.usedBy ? intl.formatMessage({ id: "upstream.used-by" }, { count: c.usedBy }) : null,
	].filter(Boolean);
	const kind = candidateKindText(c);
	return (
		<components.Option {...props} innerProps={innerProps} isFocused={isFocused}>
			{/* badges wrap onto the next line in a narrow menu instead of squeezing the host name */}
			<div className="d-flex flex-wrap align-items-center">
				<span className="me-1">{SOURCE_ICON[c.source]}</span>
				<strong className="text-break">{c.host}</strong>
				{c.state ? (
					<span
						className={cn(
							"badge ms-2 text-nowrap",
							c.state === "running" ? "bg-green-lt" : "bg-secondary-lt",
						)}
						data-state={c.state}
					>
						{containerStateText(c.state)}
					</span>
				) : null}
				{c.suggestion ? <ExistingHostBadge s={c.suggestion} /> : null}
			</div>
			{kind ? (
				<div className="text-secondary small ps-3" data-testid="option-kind">
					{kind}
				</div>
			) : null}
			{c.suggestion ? <OptionLabels s={c.suggestion} /> : null}
			{extra.length ? <div className="text-secondary small ps-3">{extra.join(" · ")}</div> : null}
			{c.suggestion ? <OptionIgnored s={c.suggestion} /> : null}
		</components.Option>
	);
};

// The input text is the only visible value (controlShouldRenderValue is off), so it
// must never be hidden. react-select hides the input after selecting an option until
// the next keystroke or focus, which would make the field look empty.
const Input = (props: InputProps<UpstreamOption, false, GroupBase<UpstreamOption>>) => (
	<components.Input {...props} isHidden={false} />
);

interface MenuFooterInfo {
	dockerDisabled: boolean;
	// Set when Docker discovery is switched on but doesn't work, e.g. no access to the API
	dockerError?: ProviderErrorText | null;
	onRefresh?: () => void;
	isRefreshing?: boolean;
}
const MenuFooterContext = createContext<MenuFooterInfo>({ dockerDisabled: false });

// Buttons inside the react-select menu: mousedown must not move the focus away
// from the input, or the menu closes before the click lands.
const keepFocus = (e: { preventDefault: () => void }) => e.preventDefault();

// Opens the in-app Docker discovery help (setup and the npm.* label reference)
function DockerHelpLink({ labels = false }: { labels?: boolean }) {
	return (
		<button
			type="button"
			className="btn btn-sm btn-link p-0 align-baseline"
			tabIndex={-1}
			onMouseDown={keepFocus}
			onClick={() => showHelpModal("DockerDiscovery", "lime")}
			data-testid={labels ? "docker-labels-link" : "docker-help-link"}
		>
			<T id={labels ? "upstream.docker-labels" : "upstream.docker-help"} />
		</button>
	);
}

/**
 * Help icon for a field label: opens the Docker discovery help with the npm.* label reference. Unlike the links in
 * the dropdown footer it is a normal Tab stop, so the reference can be reached without a mouse.
 */
export function DockerLabelsHelp() {
	const text = intl.formatMessage({ id: "upstream.docker-labels" });
	return (
		<button
			type="button"
			// not a .btn: its height would push the label text below the other labels of the row
			className="border-0 bg-transparent p-0 ms-1 lh-1 align-text-top text-secondary"
			title={text}
			aria-label={text}
			onClick={() => showHelpModal("DockerDiscovery", "lime")}
			data-testid="docker-labels-help"
		>
			<IconHelp size={16} />
		</button>
	);
}

// Menu with a footer: a hint how to enable Docker discovery (or that free text
// works), and a button to refresh the suggestions.
function MenuList(props: MenuListProps<UpstreamOption, false, GroupBase<UpstreamOption>>) {
	const { dockerDisabled, dockerError, onRefresh, isRefreshing } = useContext(MenuFooterContext);
	return (
		<>
			<components.MenuList {...props}>{props.children}</components.MenuList>
			<div className="border-top px-3 py-2 small text-secondary d-flex align-items-start">
				<span className="flex-fill">
					{dockerDisabled ? (
						<span data-testid="docker-disabled-hint">
							<T id="upstream.docker-disabled" /> <DockerHelpLink />
						</span>
					) : dockerError ? (
						<span data-testid="docker-error-hint">
							<T id="upstream.docker-unavailable" /> {dockerError.text}{" "}
							{dockerError.detail ? (
								<>
									<code className="text-break" data-testid="docker-error-detail">
										{dockerError.detail}
									</code>{" "}
								</>
							) : null}
							<DockerHelpLink />
						</span>
					) : (
						<>
							<T id="upstream.free-text" /> <DockerHelpLink labels />
						</>
					)}
				</span>
				{onRefresh ? (
					<button
						type="button"
						className="btn btn-sm btn-link p-0 ms-2"
						title={intl.formatMessage({ id: "logs.refresh" })}
						aria-label={intl.formatMessage({ id: "logs.refresh" })}
						disabled={isRefreshing}
						// Not a Tab stop: Tab from the input must reach the next field. The menu
						// closes when the input loses focus, which would unmount the button and
						// leave the focus nowhere.
						tabIndex={-1}
						// keep the menu open and the input focused
						onMouseDown={(e) => e.preventDefault()}
						onClick={() => onRefresh()}
					>
						<IconRefresh size={14} />
					</button>
				) : null}
			</div>
		</>
	);
}

interface Props {
	id: string;
	value: string;
	onChange: (host: string) => void;
	// Called after `onChange` when a discovered candidate (not free text) was picked
	onSelectCandidate?: (prefill: UpstreamPrefill, candidate: UpstreamCandidate) => void;
	onBlur?: () => void;
	placeholder?: string;
	isInvalid?: boolean;
	// For tests and storybook-like usage; normally fetched lazily on first use
	candidates?: UpstreamCandidates;
	// A proxy host's forward host: show the label domains of the containers and whether they have a host
	// already. Fetches fresh suggestions when the field is first used, since saving a host changes the latter.
	labels?: LabelInfo;
}

/**
 * Forward host input with suggestions from the upstream discovery API.
 *
 * Behaves like a text input: whatever is typed is the value, kept verbatim
 * (IPs, `host/path`, anything), while discovered containers, hosts on the
 * network and previously used hosts are offered grouped in the menu.
 */
export function UpstreamField({
	id,
	value,
	onChange,
	onSelectCandidate,
	onBlur,
	placeholder,
	isInvalid,
	candidates,
	labels,
}: Props) {
	const [wanted, setWanted] = useState(false);
	const query = useUpstreamCandidates(wanted && !candidates, labels ? { staleTime: 0 } : undefined);
	const data = candidates ?? query.data;
	const [input, setInput] = useState(value || "");
	const [menuIsOpen, setMenuIsOpen] = useState(false);
	const [navigated, setNavigated] = useState(false);
	// Input text when the menu was opened. Until the user types, all candidates
	// are offered, not only those matching the value already in the field.
	const [openedWith, setOpenedWith] = useState<string | null>(null);

	// The target the field was loaded with or last set to by a pick: candidatePrefill() compares a picked
	// candidate with it, not with the typed text (typing "web" and then picking web must still infer its scheme)
	const target = useRef(value || "");
	useEffect(() => {
		setInput((current) => {
			if (current === (value || "")) return current;
			// changed from outside (eg. the form was reset), not by typing
			target.current = value || "";
			return value || "";
		});
	}, [value]);

	const groups = useMemo(() => groupCandidates(data?.items), [data]);
	const dockerDisabled = data?.providers?.docker?.status === "disabled";
	const docker = data?.providers?.docker;
	const dockerError = useMemo(() => (docker?.status === "unavailable" ? dockerErrorText(docker) : null), [docker]);
	const { refresh, isRefreshing } = query;

	const footer = useMemo<MenuFooterInfo>(
		() => ({ dockerDisabled, dockerError, onRefresh: candidates ? undefined : refresh, isRefreshing }),
		[dockerDisabled, dockerError, candidates, refresh, isRefreshing],
	);

	const filterOption = useMemo(() => {
		const byInput = createFilter<UpstreamOption>({ stringify: optionFilterText });
		return (option: Parameters<typeof byInput>[0], text: string) => text === openedWith || byInput(option, text);
	}, [openedWith]);

	// Whether react-select may pick an option right now. Only a click on an
	// option and Enter on an option the user navigated to may; react-select
	// also picks the (invisibly) focused option on Space in an empty field, on
	// Tab (unless tabSelectsValue is off) and possibly in later versions on
	// other keys. Those are all blocked in the onChange / onCreateOption below.
	const pickAllowed = useRef(false);
	const allowClick = useCallback(() => {
		pickAllowed.current = true;
	}, []);
	const takePick = () => {
		const allowed = pickAllowed.current;
		pickAllowed.current = false;
		return allowed;
	};

	const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
		pickAllowed.current = e.key === "Enter" && menuIsOpen && navigated;
		switch (e.key) {
			case "ArrowUp":
			case "ArrowDown":
			case "PageUp":
			case "PageDown":
				// react-select already focuses an option (shown only once navigated), so
				// the first press just reveals it instead of skipping past it. A press
				// that opens the menu focuses the first option, which is shown too.
				if (menuIsOpen && !navigated) {
					e.preventDefault();
				}
				setNavigated(true);
				break;
			case "Home":
			case "End":
				// Caret keys in a text field, not option navigation. With the menu open
				// react-select would focus the first / last option (and block the caret),
				// so a later Enter would replace the typed text. preventDefault makes it
				// skip that; the caret is then moved here instead.
				if (menuIsOpen) {
					e.preventDefault();
					moveCaret(e.target as HTMLInputElement, e.key === "Home", e.shiftKey);
				}
				break;
			case "Enter":
				// Without an option chosen by keyboard, Enter keeps the typed text and
				// just closes the menu.
				if (menuIsOpen && !navigated) {
					e.preventDefault();
					setMenuIsOpen(false);
				}
				break;
			case " ":
				// react-select would pick the focused option on Space in an empty
				// field. A leading space is no use in a host name either.
				if (menuIsOpen && !input) {
					e.preventDefault();
				}
				break;
			case "Tab":
				// Close the menu before the browser moves the focus, so the focus goes
				// to the next field. The typed text stays (tabSelectsValue is off).
				if (menuIsOpen) {
					setMenuIsOpen(false);
				}
				break;
		}
	};

	const setValue = (v: string) => {
		setInput(v);
		onChange(v);
	};

	const handleChange = (opt: SingleValue<UpstreamOption>, meta: ActionMeta<UpstreamOption>) => {
		if (meta.action === "select-option" && !takePick()) {
			return;
		}
		if (!opt) {
			setValue("");
			return;
		}
		setValue(opt.value);
		if (opt.candidate && !opt.__isNew__) {
			onSelectCandidate?.(candidatePrefill(opt.candidate, target.current), opt.candidate);
		}
		target.current = opt.value;
	};

	const selected: UpstreamOption | null = value ? { value, label: value } : null;

	return (
		<MenuFooterContext.Provider value={footer}>
			<LabelInfoContext.Provider value={labels ?? null}>
				<NavigatedContext.Provider value={navigated}>
					<OptionClickContext.Provider value={allowClick}>
						<div className={cn({ "is-invalid": isInvalid })}>
							<CreatableSelect<UpstreamOption, false, GroupBase<UpstreamOption>>
								inputId={id}
								className={cn("react-select-container upstream-field", { "is-invalid": isInvalid })}
								classNamePrefix="react-select"
								options={groups}
								value={selected}
								inputValue={input}
								// The typed text *is* the value, so it's shown as input text rather than as a
								// selected chip, and stays editable.
								controlShouldRenderValue={false}
								isClearable
								isLoading={!candidates && query.isFetching}
								placeholder={placeholder}
								components={{ Option, MenuList, Input }}
								menuIsOpen={menuIsOpen}
								onMenuOpen={() => {
									setWanted(true);
									setMenuIsOpen(true);
									// When typing opens the menu this is the text before the keystroke
									setOpenedWith(input);
								}}
								onMenuClose={() => {
									setMenuIsOpen(false);
									setNavigated(false);
									setOpenedWith(null);
								}}
								onFocus={() => setWanted(true)}
								onBlur={onBlur}
								onKeyDown={handleKeyDown}
								// Tab moves on to the next field and never replaces the typed text
								tabSelectsValue={false}
								filterOption={filterOption}
								onInputChange={(v, meta) => {
									// Ignore the resets react-select does on blur / menu close / select
									if (meta.action === "input-change") {
										setNavigated(false);
										setValue(v);
									}
								}}
								onChange={handleChange}
								onCreateOption={(v) => {
									if (takePick()) setValue(v.trim());
								}}
								formatCreateLabel={(v) =>
									intl.formatMessage({ id: "upstream.use-value" }, { value: v })
								}
								isValidNewOption={(v, _selected, options) => {
									const t = v.trim();
									if (!t || t === value) return false;
									return !options.some(
										(o: any) => o.value === t || o.options?.some((i: any) => i.value === t),
									);
								}}
								noOptionsMessage={() => intl.formatMessage({ id: "upstream.no-options" })}
								loadingMessage={() => intl.formatMessage({ id: "loading" })}
								styles={{
									option: (base) => ({ ...base, height: "100%" }),
									control: (base) =>
										isInvalid
											? { ...base, borderColor: "var(--tblr-form-invalid-border-color)" }
											: base,
								}}
							/>
						</div>
					</OptionClickContext.Provider>
				</NavigatedContext.Provider>
			</LabelInfoContext.Provider>
		</MenuFooterContext.Provider>
	);
}
