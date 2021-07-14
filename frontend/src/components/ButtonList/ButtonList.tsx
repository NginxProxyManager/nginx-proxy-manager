import React, { ReactNode } from "react";

import cn from "classnames";

export interface ButtonListProps {
	/**
	 * Child elements within
	 */
	children?: ReactNode;
	/**
	 * Additional Class
	 */
	className?: string;
	/**
	 * Alignment
	 */
	align?: "center" | "right";
}
export const ButtonList: React.FC<ButtonListProps> = ({
	children,
	className,
	align,
}) => {
	const classes = {
		"justify-content-center": align === "center",
		"justify-content-end": align === "right",
	};

	return <div className={cn("btn-list", classes, className)}>{children}</div>;
};
