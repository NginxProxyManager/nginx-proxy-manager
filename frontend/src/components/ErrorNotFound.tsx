import { useNavigate } from "react-router-dom";
import { Button } from "src/components";
import { intl } from "src/locale";

export function ErrorNotFound() {
	const navigate = useNavigate();

	return (
		<div className="container-tight py-4">
			<div className="empty">
				<p className="empty-title">{intl.formatMessage({ id: "notfound.title" })}</p>
				<p className="empty-subtitle text-secondary">{intl.formatMessage({ id: "notfound.text" })}</p>
				<div className="empty-action">
					<Button type="button" size="md" onClick={() => navigate("/")}>
						{intl.formatMessage({ id: "notfound.action" })}
					</Button>
				</div>
			</div>
		</div>
	);
}
