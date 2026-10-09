import { T } from "src/locale";

interface Props {
	roles: string[];
}
export function RolesFormatter({ roles }: Props) {
	const r = roles || [];
	if (r.length === 0) {
		r[0] = "standard-user";
	}
	return (
		<>
			{r.map((role: string) => (
				<span key={role} className="badge bg-yellow-lt me-1">
					<T id={`role.${role}`} />
				</span>
			))}
		</>
	);
}
