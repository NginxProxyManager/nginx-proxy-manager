import React, { useEffect, useRef, useState } from "react";

import { Button, Dropdown, Flag } from "components";
import { useLocaleState } from "context";
import { changeLocale, getFlagCodeForLocale, intl } from "locale";

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
	const dropRef = useRef(null);
	const { locale, setLocale } = useLocaleState();
	const [localeShown, setLocaleShown] = useState(false);

	const options = [
		["us", "en-US"],
		["de", "de-DE"],
		["ir", "fa-IR"],
	];

	const handleOnChange = (e: any) => {
		changeLocale(e.currentTarget.rel);
		setLocale(e.currentTarget.rel);
		setLocaleShown(false);
		onChange && onChange(locale);
	};

	const handleClickOutside = (event: any) => {
		if (
			dropRef.current &&
			// @ts-expect-error ts-migrate(2531) FIXME: Object is possibly 'null'.
			!dropRef.current.contains(event.target)
		) {
			setLocaleShown(false);
		}
	};

	useEffect(() => {
		document.addEventListener("mousedown", handleClickOutside);
		return () => document.removeEventListener("mousedown", handleClickOutside);
	}, []);

	return (
		<div className="dropdown" {...rest} ref={dropRef}>
			<Button
				type="button"
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
