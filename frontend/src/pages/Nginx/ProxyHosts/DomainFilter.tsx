import cn from "classnames";
import { useMemo } from "react";
import { T } from "src/locale";
import { getBaseDomainCounts } from "./domainUtils";

interface Props {
	/** Per-host domain name arrays used to derive the base-domain chips. */
	hostDomainNames: string[][];
	/** Currently selected base domain, or null for "All". */
	selected: string | null;
	onSelect: (base: string | null) => void;
}

interface ChipProps {
	label: React.ReactNode;
	count?: number;
	active: boolean;
	onClick: () => void;
}

const Chip = ({ label, count, active, onClick }: ChipProps) => (
	<button
		type="button"
		onClick={onClick}
		className={cn(
			"badge",
			"domain-name",
			"me-2",
			"mb-2",
			"border-0",
			active ? "bg-lime text-white" : "bg-secondary-lt",
		)}
	>
		{label}
		{count != null ? <span className="ms-1 opacity-75">({count})</span> : null}
	</button>
);

/**
 * A row of clickable chips that filter the proxy host list by base domain.
 * Renders nothing unless there are at least two distinct base domains.
 */
export default function DomainFilter({ hostDomainNames, selected, onSelect }: Props) {
	const baseDomains = useMemo(() => getBaseDomainCounts(hostDomainNames), [hostDomainNames]);

	if (baseDomains.length < 2) {
		return null;
	}

	return (
		<div className="px-3 pt-3 d-flex flex-wrap align-items-center">
			<Chip label={<T id="filter.all" />} active={selected === null} onClick={() => onSelect(null)} />
			{baseDomains.map(({ base, count }) => (
				<Chip
					key={base}
					label={base}
					count={count}
					active={selected === base}
					onClick={() => onSelect(selected === base ? null : base)}
				/>
			))}
		</div>
	);
}
