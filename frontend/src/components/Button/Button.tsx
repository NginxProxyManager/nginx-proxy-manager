import React, { ReactNode } from "react";

import cn from "classnames";

export interface ButtonProps {
	/**
	 * Child elements within
	 */
	children?: ReactNode;
	/**
	 * Additional Class
	 */
	className?: string;
	/**
	 * Color of the Button
	 */
	color?: string;
	/**
	 * Disables the Button
	 */
	disabled?: boolean;
	/**
	 * Show a spinner instead of content
	 */
	loading?: boolean;
	/**
	 * Button shape
	 */
	shape?: "ghost" | "square" | "pill" | "outline" | "icon";
	/**
	 * Button size
	 */
	size?: "sm" | "lg";
	/**
	 * Is this button only showing an icon?
	 */
	iconOnly?: boolean;
	/**
	 * Link to url
	 */
	href?: string;
	/**
	 * target property, only used when href is set
	 */
	target?: string;
	/**
	 * On click handler
	 */
	onClick?: any;
}
export const Button: React.FC<ButtonProps> = ({
	children,
	className,
	color,
	disabled,
	loading,
	shape,
	size,
	iconOnly,
	href,
	target,
	onClick,
}) => {
	const classes = [
		"btn",
		{
			disabled: disabled,
			"btn-icon": iconOnly,
			"btn-loading": loading,
			[`btn-${size}`]: !!size,
		},
	];

	let modifier = "";
	shape === "ghost" && (modifier = "-ghost");
	shape === "outline" && (modifier = "-outline");
	shape &&
		["ghost", "outline"].indexOf(shape) === -1 &&
		classes.push(`btn-${shape}`);

	color && classes.push(`btn${modifier}-${color}`);
	modifier && classes.push(`btn${modifier}`);

	if (href) {
		// Render a A tag
		return (
			<a
				className={cn(classes, className)}
				aria-label="Button"
				href={href}
				onClick={onClick}
				target={target}>
				{children}
			</a>
		);
	}

	return (
		<button
			className={cn(classes, className)}
			aria-label="Button"
			onClick={onClick}>
			{children}
		</button>
	);
};
