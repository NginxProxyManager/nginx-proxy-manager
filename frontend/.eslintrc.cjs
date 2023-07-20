module.exports = {
	env: {
		browser: true,
		es2020: true,
	},
	extends: [
		"eslint:recommended",
		"plugin:@typescript-eslint/recommended",
		"plugin:react-hooks/recommended",
		"plugin:import/recommended",
		"plugin:import/typescript",
		"plugin:prettier/recommended",
		"plugin:react/recommended",
		"prettier",
	],
	parser: "@typescript-eslint/parser",
	parserOptions: {
		ecmaVersion: "latest",
		sourceType: "module",
	},
	plugins: ["react-refresh"],
	settings: {
		"import/resolver": {
			// You will also need to install and configure the TypeScript resolver
			// See also https://github.com/import-js/eslint-import-resolver-typescript#configuration
			typescript: true,
			node: true,
		},
	},
	rules: {
		"import/default": 0,
		"import/no-named-as-default-member": 0,
		"import/no-named-as-default": 0,
		"react-refresh/only-export-components": 0,
		"react/react-in-jsx-scope": 0,
		"prettier/prettier": ["error"],
		"@typescript-eslint/ban-ts-comment": [
			"error",
			{
				"ts-ignore": "allow-with-description",
			},
		],
		"@typescript-eslint/consistent-type-definitions": ["error", "interface"],
		"@typescript-eslint/explicit-function-return-type": ["off"],
		"@typescript-eslint/explicit-module-boundary-types": ["off"],
		"@typescript-eslint/explicit-member-accessibility": ["off"],
		"@typescript-eslint/no-empty-function": ["off"],
		"@typescript-eslint/no-explicit-any": ["off"],
		"@typescript-eslint/no-non-null-assertion": ["off"],
		"@typescript-eslint/naming-convention": [
			"error",
			{
				selector: "default",
				format: ["camelCase", "PascalCase", "UPPER_CASE"],
				leadingUnderscore: "allow",
				trailingUnderscore: "allow",
				filter: {
					regex: "^(2xl)$",
					match: false,
				},
			},
		],
		"react-hooks/rules-of-hooks": ["error"],
		"react-hooks/exhaustive-deps": [
			"warn",
			{
				additionalHooks: "useAction|useReduxAction",
			},
		],
		"react/jsx-curly-brace-presence": [
			"warn",
			{
				props: "never",
				children: "never",
			},
		],
		"no-restricted-globals": ["off"],
		"import/extensions": 0, // We let webpack handle resolving file extensions
		"import/order": [
			"error",
			{
				alphabetize: {
					order: "asc",
					caseInsensitive: true,
				},
				"newlines-between": "always",
				pathGroups: [
					{
						pattern: "@(react)",
						group: "external",
						position: "before",
					},
					{
						pattern: "@/@(fixtures|jest)/**",
						group: "internal",
						position: "before",
					},
					{
						pattern: "@/**",
						group: "internal",
					},
				],
				pathGroupsExcludedImportTypes: ["builtin", "internal"],
				groups: [
					"builtin",
					"external",
					"internal",
					["parent", "sibling", "index"],
				],
			},
		],
	},
};
