import cn from "classnames";
import type { ReactNode } from "react";
import { DateTimeFormat, T } from "src/locale";

interface Props {
	domains: string[];
	createdOn?: string;
	niceName?: string;
	provider?: string;
	color?: string;
}

const DomainLink = ({ domain, color }: { domain: string; color?: string }) => {
	// when domain contains a wildcard, make the link go nowhere.
	let onClick: ((e: React.MouseEvent) => void) | undefined;
	if (domain.includes("*")) {
		onClick = (e: React.MouseEvent) => e.preventDefault();
	}
	return (
		<a
			key={domain}
			href={`http://${domain}`}
			target="_blank"
			onClick={onClick}
			className={cn("badge", color ? `bg-${color}-lt` : null, "domain-name", "me-2")}
		>
			{domain}
		</a>
	);
};

export function DomainsFormatter({ domains, createdOn, niceName, provider, color }: Props) {
	const elms: ReactNode[] = [];
	if (domains.length === 0 && !niceName) {
		elms.push(
			<span key="nice-name" className="badge bg-danger-lt me-2">
				Unknown
			</span>,
		);
	}
	if (niceName && provider !== "letsencrypt") {
		elms.push(
			<span key="nice-name" className="badge bg-info-lt me-2">
				{niceName}
			</span>,
		);
	}

	domains.map((domain: string) => elms.push(<DomainLink key={domain} domain={domain} color={color} />));

	return (
		<div className="flex-fill">
			<div className="font-weight-medium">{...elms}</div>
			{createdOn ? (
				<div className="text-secondary mt-1">
					<T id="created-on" data={{ date: DateTimeFormat(createdOn) }} />
				</div>
			) : null}
		</div>
	);
}
