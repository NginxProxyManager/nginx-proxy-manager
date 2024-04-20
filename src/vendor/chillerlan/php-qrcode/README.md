# chillerlan/php-qrcode

A PHP QR Code generator based on the [implementation by Kazuhiko Arase](https://github.com/kazuhikoarase/qrcode-generator), namespaced, cleaned up, improved and other stuff. <br>
It also features a QR Code reader based on a [PHP port](https://github.com/khanamiryan/php-qrcode-detector-decoder) of the [ZXing library](https://github.com/zxing/zxing).

**Attention:** there is now also a javascript port: [chillerlan/js-qrcode](https://github.com/chillerlan/js-qrcode).

[![PHP Version Support][php-badge]][php]
[![Packagist version][packagist-badge]][packagist]
[![Continuous Integration][gh-action-badge]][gh-action]
[![CodeCov][coverage-badge]][coverage]
[![Codacy][codacy-badge]][codacy]
[![Packagist downloads][downloads-badge]][downloads]
[![Documentation][readthedocs-badge]][readthedocs]

[php-badge]: https://img.shields.io/packagist/php-v/chillerlan/php-qrcode?logo=php&color=8892BF
[php]: https://www.php.net/supported-versions.php
[packagist-badge]: https://img.shields.io/packagist/v/chillerlan/php-qrcode.svg?logo=packagist
[packagist]: https://packagist.org/packages/chillerlan/php-qrcode
[gh-action-badge]: https://img.shields.io/github/actions/workflow/status/chillerlan/php-qrcode/ci.yml?branch=v5.0.x&logo=github
[gh-action]: https://github.com/chillerlan/php-qrcode/actions/workflows/ci.yml?query=branch%3Amain
[coverage-badge]: https://img.shields.io/codecov/c/github/chillerlan/php-qrcode/v5.0.x?logo=codecov
[coverage]: https://app.codecov.io/gh/chillerlan/php-qrcode/tree/v5.0.x
[codacy-badge]: https://img.shields.io/codacy/grade/edccfc4fe5a34b74b1c53ee03f097b8d/v5.0.x?logo=codacy
[codacy]: https://app.codacy.com/gh/chillerlan/php-qrcode/dashboard?branch=v5.0.x
[downloads-badge]: https://img.shields.io/packagist/dt/chillerlan/php-qrcode?logo=packagist
[downloads]: https://packagist.org/packages/chillerlan/php-qrcode/stats
[readthedocs-badge]: https://img.shields.io/readthedocs/php-qrcode/v5.0.x?logo=readthedocs
[readthedocs]: https://php-qrcode.readthedocs.io/en/v5.0.x/

## Overview

### Features

- Creation of [Model 2 QR Codes](https://www.qrcode.com/en/codes/model12.html), [Version 1 to 40](https://www.qrcode.com/en/about/version.html)
- [ECC Levels](https://www.qrcode.com/en/about/error_correction.html) L/M/Q/H supported
- Mixed mode support (encoding modes can be combined within a QR symbol). Supported modes:
  - numeric
  - alphanumeric
  - 8-bit binary
    - [ECI support](https://en.wikipedia.org/wiki/Extended_Channel_Interpretation)
  - 13-bit double-byte:
    - kanji (Japanese, Shift-JIS)
    - hanzi (simplified Chinese, GB2312/GB18030) as [defined in GBT18284-2000](https://www.chinesestandard.net/PDF/English.aspx/GBT18284-2000)
- Flexible, easily extensible output modules, built-in support for the following output formats:
  - [GdImage](https://www.php.net/manual/book.image) (raster graphics: bmp, gif, jpeg, png, webp)
  - [ImageMagick](https://www.php.net/manual/book.imagick) ([multiple supported image formats](https://imagemagick.org/script/formats.php))
  - Markup types: SVG, HTML, etc.
  - String types: JSON, plain text, etc.
  - Encapsulated Postscript (EPS)
  - PDF via [FPDF](https://github.com/setasign/fpdf)
- QR Code reader (via GD and ImageMagick)


### Requirements

- PHP 7.4+
  - [`ext-mbstring`](https://www.php.net/manual/book.mbstring.php)
  - optional:
    - [`ext-gd`](https://www.php.net/manual/book.image)
    - [`ext-imagick`](https://github.com/Imagick/imagick) with [ImageMagick](https://imagemagick.org) installed
      - [`ext-fileinfo`](https://www.php.net/manual/book.fileinfo.php) (required by `QRImagick` output)
    - [`setasign/fpdf`](https://github.com/setasign/fpdf) for the PDF output module

For the QRCode reader, either `ext-gd` or `ext-imagick` is required!


## Documentation

- The user manual is at https://php-qrcode.readthedocs.io/ ([sources](https://github.com/chillerlan/php-qrcode/tree/v5.0.x/docs))
- An API documentation created with [phpDocumentor](https://www.phpdoc.org/) can be found at https://chillerlan.github.io/php-qrcode/
- The documentation for the `QROptions` container can be found here: [chillerlan/php-settings-container](https://github.com/chillerlan/php-settings-container#readme)


## Installation with [composer](https://getcomposer.org)

See [the installation guide](https://php-qrcode.readthedocs.io/en/v5.0.x/Usage/Installation.html) for more info!


### Terminal

```
composer require chillerlan/php-qrcode
```


### composer.json

```json
{
	"require": {
		"php": "^7.4 || ^8.0",
		"chillerlan/php-qrcode": "v5.0.x-dev#<commit_hash>"
	}
}
```

Note: replace `v5.0.x-dev` with a [version constraint](https://getcomposer.org/doc/articles/versions.md#writing-version-constraints), e.g. `^4.3` - see [releases](https://github.com/chillerlan/php-qrcode/releases) for valid versions.


## Quickstart

We want to encode this URI for a mobile authenticator into a QRcode image:

```php
$data = 'otpauth://totp/test?secret=B3JX4VCVJDVNXNZ5&issuer=chillerlan.net';

// quick and simple:
echo '<img src="'.(new QRCode)->render($data).'" alt="QR Code" />';
```

Wait, what was that? Please again, slower! See [Advanced usage](https://php-qrcode.readthedocs.io/en/v5.0.x/Usage/Advanced-usage.html) in the manual.
Also, have a look [in the examples folder](https://github.com/chillerlan/php-qrcode/tree/v5.0.x/examples) for some more usage examples.

<p align="center">
	<img alt="QR codes are awesome!" style="width: auto; height: 530px;" src="https://raw.githubusercontent.com/chillerlan/php-qrcode/v5.0.x/.github/images/example.svg">
</p>


### Reading QR Codes

Using the built-in QR Code reader is pretty straight-forward:

```php
// it's generally a good idea to wrap the reader in a try/catch block because it WILL throw eventually
try{
	$result = (new QRCode)->readFromFile('path/to/file.png'); // -> DecoderResult

	// you can now use the result instance...
	$content = $result->data;
	$matrix  = $result->getMatrix(); // -> QRMatrix

	// ...or simply cast it to string to get the content:
	$content = (string)$result;
}
catch(Throwable $e){
	// oopsies!
}
```


## Shameless advertising

Hi, please check out some of my other projects that are way cooler than qrcodes!

- [js-qrcode](https://github.com/chillerlan/js-qrcode) - a javascript port of this library
- [php-authenticator](https://github.com/chillerlan/php-authenticator) - a Google Authenticator implementation (see [authenticator example](https://github.com/chillerlan/php-qrcode/blob/v5.0.x/examples/authenticator.php))
- [php-httpinterface](https://github.com/chillerlan/php-httpinterface) - a PSR-7/15/17/18 implemetation
- [php-oauth-core](https://github.com/chillerlan/php-oauth-core) - an OAuth 1/2 client library along with a bunch of [providers](https://github.com/chillerlan/php-oauth-providers)
- [php-database](https://github.com/chillerlan/php-database) - a database client & querybuilder for MySQL, Postgres, SQLite, MSSQL, Firebird
- [php-tootbot](https://github.com/php-tootbot/tootbot-template) - a Mastodon bot library (see [@dwil](https://github.com/php-tootbot/dwil))


## Disclaimer!

I don't take responsibility for molten CPUs, misled applications, failed log-ins etc.. Use at your own risk!


### License notice

- Parts of this code are [ported to PHP](https://github.com/codemasher/php-qrcode-decoder) from the [ZXing project](https://github.com/zxing/zxing) and licensed under the [Apache License, Version 2.0](./NOTICE).
- [The documentation](https://github.com/chillerlan/php-qrcode/tree/v5.0.x/docs) is licensed under the [Creative Commons Attribution 4.0 International (CC BY 4.0) License](https://creativecommons.org/licenses/by/4.0/).


### Trademark Notice

The word "QR Code" is a registered trademark of *DENSO WAVE INCORPORATED*<br>
https://www.qrcode.com/en/faq.html#patentH2Title
