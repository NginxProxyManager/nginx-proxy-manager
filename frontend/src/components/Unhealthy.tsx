import { Page } from "src/components";

export function Unhealthy() {
	return (
		<Page className="page-center">
			<div className="container-tight py-4">
				<div className="empty">
					<div className="empty-img">
						<img src="/images/unhealthy.svg" alt="" />
					</div>
					<p className="empty-title">The API is not healthy.</p>
					<p className="empty-subtitle text-secondary">We'll keep checking and hope to be back soon!</p>
				</div>
			</div>
		</Page>
	);
}
