# Internationalisation support

## Adding new translations

Modify the files in the `src` folder. Follow the conventions already there.


## After making changes

You will need to run `yarn locale-compile` in this frontend folder for
the new translations to be compiled into the `lang` folder.

When running in dev mode, this should automatically happen within Vite.


## Checking for missing translations in other languages

Run `node check-locales.cjs` in this frontend folder.


## Adding new languages

todo
