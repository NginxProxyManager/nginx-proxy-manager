import DefaultTheme from "vitepress/theme";
import ApiReferenceRedoc from "./components/ApiReferenceRedoc.vue";
import ApiReferenceSwagger from "./components/ApiReferenceSwagger.vue";
import "./custom.css";

export default {
	extends: DefaultTheme,
	enhanceApp({ app }) {
		app.component("ApiReferenceRedoc", ApiReferenceRedoc);
		app.component("ApiReferenceSwagger", ApiReferenceSwagger);
	},
};
