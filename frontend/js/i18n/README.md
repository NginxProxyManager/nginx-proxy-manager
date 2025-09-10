# Internationalization (i18n) Language Files

This directory contains multi-language support files for the Nginx Proxy Manager frontend interface.

## File Structure

```
frontend/js/i18n/
├── zh-CN.json     # Chinese (Simplified) translation file
├── zh-TW.json     # Chinese (Traditional) translation file
├── en-US.json     # English (US) translation file
├── fr-FR.json     # French translation file
├── ja-JP.json     # Japanese translation file
├── ko-KR.json     # Korean translation file
├── ru-RU.json     # Russian translation file
├── pt-PT.json     # Portuguese translation file
└── README.md      # Documentation
```

## Supported Languages

- **zh-CN** - Chinese (Simplified) - 中文 (简体)
- **zh-TW** - Chinese (Traditional) - 中文 (繁體)
- **en-US** - English (US)
- **fr-FR** - French (Français)
- **ja-JP** - Japanese (日本語)
- **ko-KR** - Korean (한국어)
- **ru-RU** - Russian (Русский)
- **pt-PT** - Portuguese (Português)

## How to Modify Translations

### 1. Editing Existing Translations

Edit the corresponding language file:
- Chinese (Simplified) translation: Edit `zh-CN.json`
- Chinese (Traditional) translation: Edit `zh-TW.json`
- English (US) translation: Edit `en-US.json`
- And so on for other languages...

### 2. Adding New Translation Keys

Add new keys to the appropriate language files following this format:

```json
{
  "group-name": {
    "key-name": "translation text"
  }
}
```

Example:
```json
{
  "settings": {
    "new-feature": "New Feature"
  }
}
```

### 3. Using Translations in Code

```javascript
i18n('group-name', 'key-name', {parameter-object})
```

Examples:
```javascript
i18n('settings', 'new-feature')
i18n('main', 'version', {version: '2.0.0'})
```

## Adding a New Language

To add support for a new language (e.g., German `de`):

### 1. Create New Language File

```bash
cp en-US.json de-DE.json
```

### 2. Translate File Content

Translate all English text in `de.json` to German

### 3. Update Webpack Configuration

Edit `frontend/webpack.config.js`, change:
```javascript
test: /\/(en|zh)\.json$/,
locale: ['en', 'zh'],
```
to:
```javascript
test: /\/(en|zh|tw|fr|jp|kr|ru|pt|de)\.json$/,
locale: ['en', 'zh', 'tw', 'fr', 'jp', 'kr', 'ru', 'pt', 'de'],
```

### 4. Update i18n import context

Update the bundler include list in `frontend/js/app/i18n.js` to make sure Webpack packs the new language file:

```javascript
// Add 'de' to the regex list so the file is bundled
localesContext = require.context('../i18n', false, /^\.\/(en|zh|tw|fr|ja|ko|ru|pt|de)\.json$/);
```

### 5. Update Language Detection Logic

Edit the language detection logic in `frontend/js/app/cache.js`:

```javascript
// Add browser language detection for the new language
if (browserLang.startsWith('de')) {
    return 'de';
}

// Add to the validation array
if (saved && ['zh', 'en', 'fr', 'jp', 'tw', 'kr', 'ru', 'pt', 'de'].includes(saved)) {
    return saved;
}
```

### 6. Update Language Selector

Edit `frontend/js/app/settings/list/item.js` and `frontend/js/app/settings/list/item.ejs` to include the new language option in the dropdown.

## Important Notes

### 1. Placeholder Syntax

Use `{variable-name}` format for placeholders:

```json
"welcome": "Welcome {name}!"
```

### 2. Plural Forms

Use MessageFormat syntax for plural forms:

```json
"item-count": "{count} {count, select, 1{item} other{items}}"
```

### 3. HTML Content

You can include HTML tags in translations:

```json
"link": "Visit our <a href=\"{url}\">website</a>"
```

### 4. Consistent Key Names

All language files should have the same key structure to ensure consistency.

## Language Switching

Users can switch languages through:
- Language switching option in the user menu
- Language settings in the Settings page
- Automatic browser language detection

## Building

After modifying translation files, you need to rebuild the frontend:

```bash
cd frontend
yarn build
```

## Troubleshooting

### Common Issues

- **Translations not showing**: Check if JSON syntax is correct
- **Showing "(MISSING: ...)"**: Check if translation key exists in the language file
- **Build fails**: Check webpack configuration and file paths
- **New language not detected**: Verify language code is added to all necessary configuration files

### Validation

Before submitting changes:

1. **Validate JSON syntax**: Ensure all language files have valid JSON syntax
2. **Check key consistency**: Verify all language files have the same key structure
3. **Test in browser**: Test language switching functionality
4. **Build successfully**: Ensure the frontend builds without errors

### Development Tips

- Use a JSON validator to check syntax
- Keep translation keys descriptive and organized
- Test with different browser language settings
- Consider cultural context when translating, not just literal translation
- Maintain consistent terminology across the interface

## Contributing

When contributing translations:

1. **Fork the repository**
2. **Create a feature branch** for your translation work
3. **Follow the existing key structure** in translation files
4. **Test your changes** thoroughly
5. **Submit a pull request** with clear description of changes

### Translation Guidelines

- Keep translations concise and clear
- Maintain the same tone as the English version
- Consider UI space constraints
- Use appropriate terminology for technical concepts
- Be consistent with existing translations in the same language

---

For technical implementation details, see the main project documentation and the `frontend/js/app/i18n.js` file.