import cn from "classnames";
import { Flag } from "src/components";
import { useLocaleState } from "src/context";
import { useTheme } from "src/hooks";
import { changeLocale, getFlagCodeForLocale, localeOptions, T } from "src/locale";
import styles from "./LocalePicker.module.css";

interface Props {
	menuAlign?: "start" | "end";
}

function LocalePicker({ menuAlign = "start" }: Props) {
	const { locale, setLocale } = useLocaleState();
	const { getTheme } = useTheme();

	const changeTo = (lang: string) => {
		changeLocale(lang);
		setLocale(lang);
		location.reload();
	};

	const classes = ["btn", "dropdown-toggle", "btn-sm", styles.btn];
	const cns = cn(...classes, getTheme() === "dark" ? "btn-ghost-dark" : "btn-ghost-light");

	return (
		<div className="dropdown">
			<button type="button" className={cns} data-bs-toggle="dropdown">
				<Flag countryCode={getFlagCodeForLocale(locale)} />
			</button>
			<div
				className={cn("dropdown-menu", {
					"dropdown-menu-end": menuAlign === "end",
				})}
			>
				{localeOptions.map((item: any) => (
					<a
						className="dropdown-item"
						href={`/locale/${item[0]}`}
						key={`locale-${item[0]}`}
						onClick={(e) => {
							e.preventDefault();
							changeTo(item[0]);
						}}
					>
						<Flag countryCode={getFlagCodeForLocale(item[0])} /> <T id={`locale-${item[1]}`} />
					</a>
				))}
			</div>
		</div>
	);
}

export { LocalePicker };
