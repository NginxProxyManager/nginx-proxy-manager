import React, { ReactNode } from "react";

import cn from "classnames";

import { Badge } from "../Badge";

export interface AvatarProps {
	/**
	 * Child elements within
	 */
	children?: ReactNode;
	/**
	 * Additional Class
	 */
	className?: string;
	/**
	 * Color only when using Initials
	 */
	color?: string;
	/**
	 * Full or data url of an avatar image
	 */
	url?: string;
	/**
	 * Initials to use instead of an image
	 */
	initials?: string;
	/**
	 * Size of the avatar
	 */
	size?: string;
	/**
	 * Display a status color
	 */
	status?: "info" | "success" | "warning" | "danger";
	/**
	 * Shape of the avatar
	 */
	shape?: "rounded" | "rounded-circle" | "rounded-0" | "rounded-lg";
	/**
	 * Icon instead of Image or Initials
	 */
	icon?: ReactNode;
}
export const Avatar: React.FC<AvatarProps> = ({
	children,
	className,
	color,
	url,
	initials,
	size,
	shape,
	status,
	icon,
}) => {
	const styles = {
		backgroundImage: "url('" + url + "')",
	};

	const classes = [];
	color && classes.push("bg-" + color);
	size && classes.push("avatar-" + size);
	shape && classes.push(shape);

	return (
		<span style={styles} className={cn("avatar", classes, className)}>
			{initials && !url ? initials.toUpperCase() : null}
			{!initials && !url ? children : null}
			{icon && <span className="avatar-icon">{icon}</span>}
			{status ? <Badge color={status} /> : null}
		</span>
	);
};
