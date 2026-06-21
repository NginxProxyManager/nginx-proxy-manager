import type React from "react";
import { IconRefresh } from "@tabler/icons-react";
import Alert from "react-bootstrap/Alert";
import { Button, Loading } from "src/components";
import type { AgentTarget } from "src/hooks";

interface Props {
	target: AgentTarget;
	color?: string;
	isLoading?: boolean;
	isFetching?: boolean;
	isError?: boolean;
	error?: Error | null;
	shownCount?: number;
	totalCount?: number;
	onRetry?: () => void;
	actions?: React.ReactNode;
	children: React.ReactNode;
}

function AgentSection({
	target,
	color = "primary",
	isLoading,
	isFetching,
	isError,
	error,
	shownCount,
	totalCount,
	onRetry,
	actions,
	children,
}: Props) {
	return (
		<div className="card my-3 border">
			<div className={`card-status-start bg-${color}`} />
			<div className="card-header py-2">
				<div className="row w-full align-items-center g-2">
					<div className="col">
						<div className="d-flex align-items-center gap-2 flex-wrap">
							<h3 className="card-title mb-0">{target.name}</h3>
							<span className="badge bg-green-lt">{target.isLocal ? "local" : "agent"}</span>
							{typeof shownCount === "number" && typeof totalCount === "number" ? (
								<span className="badge bg-secondary-lt">
									{shownCount} shown / {totalCount} total
								</span>
							) : null}
							{isFetching && !isLoading ? <span className="badge bg-blue-lt">refreshing</span> : null}
						</div>
						<div className="text-muted small text-truncate">{target.subtitle}</div>
					</div>
					{actions ? <div className="col-auto d-flex gap-2">{actions}</div> : null}
				</div>
			</div>
			{isLoading ? (
				<div className="card-body py-4">
					<Loading noLogo />
				</div>
			) : isError ? (
				<div className="card-body">
					<Alert variant="danger" className="mb-0 d-flex align-items-center justify-content-between gap-3">
						<span>{error?.message || "Unknown error"}</span>
						{onRetry ? (
							<Button size="sm" onClick={onRetry}>
								<IconRefresh size={16} /> Retry
							</Button>
						) : null}
					</Alert>
				</div>
			) : (
				children
			)}
		</div>
	);
}

export { AgentSection };
