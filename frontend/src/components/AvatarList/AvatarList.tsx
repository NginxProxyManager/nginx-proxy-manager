import React, { ReactNode } from "react";

import cn from "classnames";

export interface AvatarListProps {
	/**
	 * Child elements within
	 */
	children?: ReactNode;
	/**
	 * Additional Class
	 */
	className?: string;
	/**
	 * Displays stacked avatars
	 */
	stacked?: boolean;
}
export const AvatarList: React.FC<AvatarListProps> = ({
	children,
	className,
	stacked,
}) => {
	return (
		<div
			className={cn(
				"avatar-list",
				stacked && "avatar-list-stacked",
				className,
			)}>
			{children}
		</div>
	);
};
