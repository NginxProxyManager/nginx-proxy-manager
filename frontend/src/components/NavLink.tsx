import { useNavigate } from "react-router-dom";

interface Props {
	children: React.ReactNode;
	to?: string;
	isDropdownItem?: boolean;
	onClick?: () => void;
}
export function NavLink({ children, to, isDropdownItem, onClick }: Props) {
	const navigate = useNavigate();

	return (
		<a
			className={isDropdownItem ? "dropdown-item" : "nav-link"}
			href={to}
			onClick={(e) => {
				e.preventDefault();
				if (onClick) {
					onClick();
				}
				if (to) {
					navigate(to);
				}
			}}
		>
			{children}
		</a>
	);
}
