import React, { ReactNode } from "react";

import cn from "classnames";

export interface BadgeProps {
	/**
	 * Child elements within
	 */
	children?: ReactNode;
	/**
	 * Additional Class
	 */
	className?: string;
	/**
	 * Color of the Badge
	 */
	color?: string;
	/**
	 * Type of Badge
	 */
	type?: "pill" | "soft";
}
export const Badge: React.FC<BadgeProps> = ({
	children,
	className,
	color,
	type,
}) => {
	let modifier = "";

	type === "soft" && (modifier = "-lt");
	const classes = ["badge", "bg-" + (color || "blue") + modifier];
	type === "pill" && classes.push("badge-pill");

	return <span className={cn(classes, className)}>{children}</span>;
};
