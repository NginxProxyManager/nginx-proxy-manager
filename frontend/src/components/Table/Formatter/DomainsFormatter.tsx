import { DateTimeFormat, intl } from "src/locale";

interface Props {
	domains: string[];
	createdOn?: string;
}

const DomainLink = ({ domain }: { domain: string }) => {
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
			className="badge bg-yellow-lt domain-name me-2"
		>
			{domain}
		</a>
	);
};

export function DomainsFormatter({ domains, createdOn }: Props) {
	return (
		<div className="flex-fill">
			<div className="font-weight-medium">
				{domains.map((domain: string) => (
					<DomainLink key={domain} domain={domain} />
				))}
			</div>
			{createdOn ? (
				<div className="text-secondary mt-1">
					{intl.formatMessage({ id: "created-on" }, { date: DateTimeFormat(createdOn) })}
				</div>
			) : null}
		</div>
	);
}
