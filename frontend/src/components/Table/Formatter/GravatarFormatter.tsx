const defaultImg = "/images/default-avatar.jpg";

interface Props {
	url?: string;
	name?: string;
}
export function GravatarFormatter({ url, name }: Props) {
	return (
		<div className="d-flex py-1 align-items-center">
			<span
				title={name}
				className="avatar avatar-2 me-2"
				style={{
					backgroundImage: `url(${url || defaultImg})`,
				}}
			/>
		</div>
	);
}
