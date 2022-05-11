import { ReactNode } from "react";

import cn from "classnames";

interface LoaderProps {
	/**
	 * Child elements within
	 */
	children?: ReactNode;
	/**
	 * Additional Class
	 */
	className?: string;
}
function Loader({ children, className }: LoaderProps) {
	return <div className={cn({ loader: true }, className)}>{children}</div>;
}

export { Loader };
