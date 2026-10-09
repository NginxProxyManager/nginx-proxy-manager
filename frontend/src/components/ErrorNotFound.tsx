import { useNavigate } from "react-router-dom";
import { Button } from "src/components";
import { T } from "src/locale";

export function ErrorNotFound() {
	const navigate = useNavigate();

	return (
		<div className="container-tight py-4">
			<div className="empty">
				<p className="empty-title">
					<T id="notfound.title" />
				</p>
				<p className="empty-subtitle text-secondary">
					<T id="notfound.content" />
				</p>
				<div className="empty-action">
					<Button type="button" size="md" onClick={() => navigate("/")}>
						<T id="notfound.action" />
					</Button>
				</div>
			</div>
		</div>
	);
}
