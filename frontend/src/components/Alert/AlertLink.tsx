import React, { ReactNode } from "react";

import cn from "classnames";

export interface AlertLinkProps {
	/**
	 * Child elements within
	 */
	children?: ReactNode;
	/**
	 * Additional Class
	 */
	className?: string;
	/**
	 * Href
	 */
	href?: string;
	/**
	 * onClick handler
	 */
	onClick?: React.MouseEventHandler<HTMLAnchorElement>;
}
export const AlertLink: React.FC<AlertLinkProps> = ({
	children,
	className,
	href,
	onClick,
}) => {
	return (
		<a className={cn("alert-link", className)} href={href} onClick={onClick}>
			{children}
		</a>
	);
};
