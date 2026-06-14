interface Props {
	email: string;
}
export function EmailFormatter({ email }: Props) {
	return (
		<a href={`mailto:${email}`} className="badge bg-yellow-lt">
			{email}
		</a>
	);
}
