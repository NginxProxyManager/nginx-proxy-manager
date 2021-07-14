import React, { ReactNode } from "react";

import cn from "classnames";

export interface LoaderProps {
	/**
	 * Child elements within
	 */
	children?: ReactNode;
	/**
	 * Additional Class
	 */
	className?: string;
}
export const Loader: React.FC<LoaderProps> = ({ children, className }) => {
	return <div className={cn({ loader: true }, className)}>{children}</div>;
};
