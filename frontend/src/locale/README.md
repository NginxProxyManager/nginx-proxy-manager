# Internationalisation support

## Before you start

It's highly recommended that you spin up a development instance of this project
on your docker capable server. It's pretty easy:

```bash
git clone https://github.com/NginxProxyManager/nginx-proxy-manager.git
cd nginx-proxy-manager
./scripts/start-dev -f
```

Then after a while, you can access http://yourserverip:3081

This stack will watch the file system for changes, especially to language files,
and reload the site you have open in the browser.


## Adding new translations

Modify the files in the `src` folder. Follow the conventions already there.

When the development stack is running, it will sort the locale lang files
for you when you save.


## After making changes

If you're NOT running the development stack, you will need to run
`yarn locale-compile` in the `frontend` folder for
the new translations to be compiled into the `lang` folder.


## Adding a whole new language

There's a fair bit you'll need to touch. Here's a list that may
not be complete by the time you're reading this:

- frontend/src/locale/src/[yourlang].json
- frontend/src/locale/src/lang-list.json
- frontend/src/locale/src/HelpDoc/[yourlang]/*
- frontend/src/locale/src/HelpDoc/index.tsx
- frontend/src/locale/IntlProvider.tsx
- frontend/check-locales.cjs


## Checking for missing translations in languages

Run `node check-locales.cjs` in this frontend folder.
