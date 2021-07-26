import React, { useState } from "react";

import { Button, Dropdown, Flag } from "components";
import { useLocaleState } from "context";
import { changeLocale, getFlagCodeForLocale, getLocale, intl } from "locale";

export interface LocalPickerProps {
	/**
	 * On click handler
	 */
	onChange?: any;
}

export const LocalePicker: React.FC<LocalPickerProps> = ({
	onChange,
	...rest
}) => {
	const { locale, setLocale } = useLocaleState();

	// const [locale, setLocale] = useState(getLocale());
	const [localeShown, setLocaleShown] = useState(false);

	const handleOnChange = (e: any) => {
		changeLocale(e.currentTarget.rel);
		setLocale(e.currentTarget.rel);
		setLocaleShown(false);
		onChange && onChange(locale);
	};

	const options = [
		["us", "en-US"],
		["de", "de-DE"],
		["ir", "fa-IR"],
	];

	return (
		<div className="dropdown" {...rest}>
			<Button
				shape="ghost"
				onClick={(e: any) => {
					setLocaleShown(!localeShown);
					e.preventDefault();
				}}
				iconOnly>
				<Flag country={getFlagCodeForLocale(locale)} />
			</Button>
			<Dropdown
				className="dropdown-menu-end dropdown-menu-card"
				show={localeShown}>
				{options.map((item) => {
					return (
						<Dropdown.Item
							key={`locale-${item[0]}`}
							rel={item[1]}
							icon={<Flag country={item[0]} />}
							onClick={handleOnChange}>
							{intl.formatMessage({
								id: `locale-${item[1]}`,
								defaultMessage: item[1],
							})}
						</Dropdown.Item>
					);
				})}
			</Dropdown>
		</div>
	);
};
