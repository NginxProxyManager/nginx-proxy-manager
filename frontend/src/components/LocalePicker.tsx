import {
	Button,
	Box,
	Menu,
	MenuButton,
	MenuButtonProps,
	MenuList,
	MenuItem,
} from "@chakra-ui/react";
import { Flag } from "components";
import { useLocaleState } from "context";
import {
	changeLocale,
	getFlagCodeForLocale,
	intl,
	localeOptions,
} from "locale";

interface LocalPickerProps {
	onChange?: any;
	className?: string;
	background?: "normal" | "transparent";
}

function LocalePicker({ onChange, className, background }: LocalPickerProps) {
	const { locale, setLocale } = useLocaleState();

	const additionalProps: Partial<MenuButtonProps> = {};
	if (background === "transparent") {
		additionalProps["backgroundColor"] = "transparent";
	}

	const changeTo = (lang: string) => {
		changeLocale(lang);
		setLocale(lang);
		onChange && onChange(locale);
		location.reload();
	};

	return (
		<Box className={className}>
			<Menu>
				<MenuButton as={Button} {...additionalProps}>
					<Flag countryCode={getFlagCodeForLocale(locale)} />
				</MenuButton>
				<MenuList>
					{localeOptions.map((item) => {
						return (
							<MenuItem
								icon={<Flag countryCode={getFlagCodeForLocale(item[0])} />}
								onClick={() => changeTo(item[0])}
								key={`locale-${item[0]}`}>
								<span>{intl.formatMessage({ id: `locale-${item[1]}` })}</span>
							</MenuItem>
						);
					})}
				</MenuList>
			</Menu>
		</Box>
	);
}

export { LocalePicker };
