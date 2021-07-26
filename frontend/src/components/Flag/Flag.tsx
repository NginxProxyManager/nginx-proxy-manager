import React from "react";

import cn from "classnames";

export interface FlagProps {
	/**
	 * Additional Class
	 */
	className?: string;
	/**
	 * Country code of flag
	 */
	country: string;
	/**
	 * Size of the flag
	 */
	size?: string;
}
export const Flag: React.FC<FlagProps> = ({ className, country, size }) => {
	const classes = [
		`flag-country-${country.toLowerCase()}`,
		{
			[`flag-${size}`]: !!size,
		},
	];

	return <span className={cn("flag", classes, className)} />;
};
