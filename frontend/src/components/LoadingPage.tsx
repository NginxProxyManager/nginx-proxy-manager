import { Loading, Page } from "src/components";

interface Props {
	label?: string;
	noLogo?: boolean;
}
export function LoadingPage({ label, noLogo }: Props) {
	return (
		<Page className="page-center">
			<div className="container-tight py-4">
				<Loading label={label} noLogo={noLogo} />
			</div>
		</Page>
	);
}
