import cn from "classnames";
import type { ComponentProps, ReactNode } from "react";

interface Props extends Omit<ComponentProps<"button">, "color" | "onClick" | "type"> {
	children: ReactNode;
	className?: string;
	type?: "button" | "submit";
	actionType?: "primary" | "secondary" | "success" | "warning" | "danger" | "info" | "light" | "dark";
	variant?: "ghost" | "outline" | "pill" | "square" | "action";
	size?: "sm" | "md" | "lg" | "xl";
	fullWidth?: boolean;
	isLoading?: boolean;
	disabled?: boolean;
	color?:
		| "blue"
		| "azure"
		| "indigo"
		| "purple"
		| "pink"
		| "red"
		| "orange"
		| "yellow"
		| "lime"
		| "green"
		| "teal"
		| "cyan";
	onClick?: () => void;
}
function Button({
	children,
	className,
	onClick,
	type,
	actionType,
	variant,
	size,
	color,
	fullWidth,
	isLoading,
	disabled,
	...rest
}: Props) {
	const myOnClick = () => {
		!isLoading && onClick && onClick();
	};

	const cns = cn(
		"btn",
		className,
		actionType && `btn-${actionType}`,
		variant && `btn-${variant}`,
		size && `btn-${size}`,
		color && `btn-${color}`,
		fullWidth && "w-100",
		isLoading && "btn-loading",
	);

	return (
		<button {...rest} type={type || "button"} className={cns} onClick={myOnClick} disabled={disabled}>
			{children}
		</button>
	);
}

export { Button };
