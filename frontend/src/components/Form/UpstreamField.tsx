import { IconBrandDocker, IconHistory, IconNetwork, IconRefresh } from "@tabler/icons-react";
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
import type { UpstreamCandidate, UpstreamCandidates, UpstreamSource } from "src/api/backend";
import { useUpstreamCandidates } from "src/hooks";
import { intl, T } from "src/locale";
import { showHelpModal } from "src/modals";

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
export const candidatePrefill = (c: UpstreamCandidate): UpstreamPrefill => {
	const prefill: UpstreamPrefill = {};
	if (typeof c.hintPort === "number" && c.hintPort > 0) {
		prefill.port = c.hintPort;
	} else if (c.ports?.length === 1) {
		prefill.port = c.ports[0];
	}
	if (c.hintScheme === "http" || c.hintScheme === "https") {
		prefill.scheme = c.hintScheme;
	}
	return prefill;
};

/** react-select option groups, one per source, in a fixed order, empty ones left out */
export const groupCandidates = (items: UpstreamCandidate[] = []): GroupBase<UpstreamOption>[] =>
	SOURCE_ORDER.map((source) => ({
		label: intl.formatMessage({ id: `upstream.group.${source}` }),
		options: items
			.filter((c) => c.source === source)
			.map((c) => ({ value: c.host, label: c.label || c.host, candidate: c })),
	})).filter((g) => g.options.length > 0);

/**
 * The port and scheme of a prefill that may actually be written: only fields
 * that are empty, still hold their saved (initial) value, or still hold what an
 * earlier pick filled in. A port or scheme the user set themselves is kept.
 */
export const allowedPrefill = (
	prefill: UpstreamPrefill,
	current: { port?: unknown; scheme?: unknown },
	initial: { port?: unknown; scheme?: unknown },
	previous: UpstreamPrefill = {},
): UpstreamPrefill => {
	const same = (a: unknown, b: unknown) => typeof b !== "undefined" && b !== null && `${a}` === `${b}`;
	const isFree = (key: "port" | "scheme") => {
		const c = current[key];
		return c === undefined || c === null || c === "" || same(c, initial[key]) || same(c, previous[key]);
	};
	const result: UpstreamPrefill = {};
	if (prefill.port && isFree("port")) result.port = prefill.port;
	if (prefill.scheme && isFree("scheme")) result.scheme = prefill.scheme;
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
			previous.current = { ...previous.current, ...result };
			return result;
		},
		[],
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
		c.ports?.length ? intl.formatMessage({ id: "upstream.ports" }, { ports: c.ports.join(", ") }) : null,
		c.network,
		c.usedBy ? intl.formatMessage({ id: "upstream.used-by" }, { count: c.usedBy }) : null,
	].filter(Boolean);
	return (
		<components.Option {...props} innerProps={innerProps} isFocused={isFocused}>
			<div className="d-flex align-items-center">
				<span className="me-1">{SOURCE_ICON[c.source]}</span>
				<strong className="text-break">{c.host}</strong>
				{c.state ? (
					<span
						className={cn("badge ms-2", c.state === "running" ? "bg-green-lt" : "bg-secondary-lt")}
						data-state={c.state}
					>
						{c.state}
					</span>
				) : null}
			</div>
			{c.label && c.label !== c.host ? <div className="text-secondary small ps-3">{c.label}</div> : null}
			{extra.length ? <div className="text-secondary small ps-3">{extra.join(" · ")}</div> : null}
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
	dockerError?: string | null;
	onRefresh?: () => void;
	isRefreshing?: boolean;
}
const MenuFooterContext = createContext<MenuFooterInfo>({ dockerDisabled: false });

// Buttons inside the react-select menu: mousedown must not move the focus away
// from the input, or the menu closes before the click lands.
const keepFocus = (e: { preventDefault: () => void }) => e.preventDefault();

function DockerHelpLink() {
	return (
		<button
			type="button"
			className="btn btn-sm btn-link p-0 align-baseline"
			tabIndex={-1}
			onMouseDown={keepFocus}
			onClick={() => showHelpModal("DockerDiscovery", "lime")}
			data-testid="docker-help-link"
		>
			<T id="upstream.docker-help" />
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
							<T id="upstream.docker-unavailable" data={{ reason: dockerError }} /> <DockerHelpLink />
						</span>
					) : (
						<T id="upstream.free-text" />
					)}
				</span>
				{onRefresh ? (
					<button
						type="button"
						className="btn btn-sm btn-link p-0 ms-2"
						title={intl.formatMessage({ id: "upstream.refresh" })}
						aria-label={intl.formatMessage({ id: "upstream.refresh" })}
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
}: Props) {
	const [wanted, setWanted] = useState(false);
	const query = useUpstreamCandidates(wanted && !candidates);
	const data = candidates ?? query.data;
	const [input, setInput] = useState(value || "");
	const [menuIsOpen, setMenuIsOpen] = useState(false);
	const [navigated, setNavigated] = useState(false);
	// Input text when the menu was opened. Until the user types, all candidates
	// are offered, not only those matching the value already in the field.
	const [openedWith, setOpenedWith] = useState<string | null>(null);

	useEffect(() => {
		setInput((current) => (current === (value || "") ? current : value || ""));
	}, [value]);

	const groups = useMemo(() => groupCandidates(data?.items), [data]);
	const dockerDisabled = data?.providers?.docker?.status === "disabled";
	const dockerError = data?.providers?.docker?.status === "unavailable" ? data.providers.docker.message || "?" : null;
	const { refresh, isRefreshing } = query;

	const footer = useMemo<MenuFooterInfo>(
		() => ({ dockerDisabled, dockerError, onRefresh: candidates ? undefined : refresh, isRefreshing }),
		[dockerDisabled, dockerError, candidates, refresh, isRefreshing],
	);

	const filterOption = useMemo(() => {
		const byInput = createFilter<UpstreamOption>();
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
			onSelectCandidate?.(candidatePrefill(opt.candidate), opt.candidate);
		}
	};

	const selected: UpstreamOption | null = value ? { value, label: value } : null;

	return (
		<MenuFooterContext.Provider value={footer}>
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
							formatCreateLabel={(v) => intl.formatMessage({ id: "upstream.use-value" }, { value: v })}
							isValidNewOption={(v, _selected, options) => {
								const t = v.trim();
								if (!t || t === value) return false;
								return !options.some(
									(o: any) => o.value === t || o.options?.some((i: any) => i.value === t),
								);
							}}
							noOptionsMessage={() => intl.formatMessage({ id: "upstream.no-options" })}
							loadingMessage={() => intl.formatMessage({ id: "upstream.loading" })}
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
		</MenuFooterContext.Provider>
	);
}
