interface Props {
	children: React.ReactNode;
}
export function SiteContainer({ children }: Props) {
	return <div className="container-xl py-3 min-w-0 overflow-x-auto">{children}</div>;
}
