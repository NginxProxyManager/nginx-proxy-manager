# chillerlan/php-settings-container

A container class for settings objects - decouple configuration logic from your application! Not a DI container.
- [`SettingsContainerInterface`](https://github.com/chillerlan/php-settings-container/blob/main/src/SettingsContainerInterface.php) provides immutable properties with magic getter & setter and some fancy.

[![PHP Version Support][php-badge]][php]
[![version][packagist-badge]][packagist]
[![license][license-badge]][license]
[![Continuous Integration][gh-action-badge]][gh-action]
[![Coverage][coverage-badge]][coverage]
[![Codacy][codacy-badge]][codacy]
[![Packagist downloads][downloads-badge]][downloads]

[php-badge]: https://img.shields.io/packagist/php-v/chillerlan/php-settings-container?logo=php&color=8892BF
[php]: https://www.php.net/supported-versions.php
[packagist-badge]: https://img.shields.io/packagist/v/chillerlan/php-settings-container.svg?logo=packagist
[packagist]: https://packagist.org/packages/chillerlan/php-settings-container
[license-badge]: https://img.shields.io/github/license/chillerlan/php-settings-container.svg
[license]: https://github.com/chillerlan/php-settings-container/blob/main/LICENSE
[coverage-badge]: https://img.shields.io/codecov/c/github/chillerlan/php-settings-container.svg?logo=codecov
[coverage]: https://codecov.io/github/chillerlan/php-settings-container
[codacy-badge]: https://img.shields.io/codacy/grade/bd2467799e2943d2853ce3ebad5af490/main?logo=codacy
[codacy]: https://www.codacy.com/gh/chillerlan/php-settings-container/dashboard?branch=main
[downloads-badge]: https://img.shields.io/packagist/dt/chillerlan/php-settings-container.svg?logo=packagist
[downloads]: https://packagist.org/packages/chillerlan/php-settings-container/stats
[gh-action-badge]: https://img.shields.io/github/actions/workflow/status/chillerlan/php-settings-container/ci.yml?branch=main&logo=github
[gh-action]: https://github.com/chillerlan/php-settings-container/actions/workflows/ci.yml?query=branch%3Amain

## Documentation

### Installation
**requires [composer](https://getcomposer.org)**

*composer.json* (note: replace `dev-main` with a [version constraint](https://getcomposer.org/doc/articles/versions.md#writing-version-constraints), e.g. `^3.0` - see [releases](https://github.com/chillerlan/php-settings-container/releases) for valid versions)
```json
{
	"require": {
		"php": "^8.1",
		"chillerlan/php-settings-container": "dev-main"
	}
}
```

Profit!

## Usage

The `SettingsContainerInterface` (wrapped in`SettingsContainerAbstract`) provides plug-in functionality for immutable object properties and adds some fancy, like loading/saving JSON, arrays etc.
It takes an `iterable` as the only constructor argument and calls a method with the trait's name on invocation (`MyTrait::MyTrait()`) for each used trait.

### Simple usage
```php
class MyContainer extends SettingsContainerAbstract{
	protected string $foo;
	protected string $bar;
}
```

```php
// use it just like a \stdClass (except the properties are fixed)
$container = new MyContainer;
$container->foo = 'what';
$container->bar = 'foo';

// which is equivalent to
$container = new MyContainer(['bar' => 'foo', 'foo' => 'what']);
// ...or try
$container->fromJSON('{"foo": "what", "bar": "foo"}');


// fetch all properties as array
$container->toArray(); // -> ['foo' => 'what', 'bar' => 'foo']
// or JSON
$container->toJSON(); // -> {"foo": "what", "bar": "foo"}
// JSON via JsonSerializable
$json = json_encode($container); // -> {"foo": "what", "bar": "foo"}

//non-existing properties will be ignored:
$container->nope = 'what';

var_dump($container->nope); // -> null
```

### Advanced usage
```php
// from library 1
trait SomeOptions{
	protected string $foo;
	protected string $what;

	// this method will be called in SettingsContainerAbstract::construct()
	// after the properties have been set
	protected function SomeOptions():void{
		// just some constructor stuff...
		$this->foo = strtoupper($this->foo);
	}

	/*
	 * special prefixed magic setters & getters
	 */

	// this method will be called from __set() when property $what is set
	protected function set_what(string $value):void{
		$this->what = md5($value);
	}

	// this method is called on __get() for the property $what
	protected function get_what():string{
		return 'hash: '.$this->what;
	}
}

// from library 2
trait MoreOptions{
	protected string $bar = 'whatever'; // provide default values
}
```

```php
$commonOptions = [
	// SomeOptions
	'foo' => 'whatever',
	// MoreOptions
	'bar' => 'nothing',
];

// now plug the several library options together to a single object
$container = new class ($commonOptions) extends SettingsContainerAbstract{
	use SomeOptions, MoreOptions;
};

var_dump($container->foo); // -> WHATEVER (constructor ran strtoupper on the value)
var_dump($container->bar); // -> nothing

$container->what = 'some value';
var_dump($container->what); // -> hash: 5946210c9e93ae37891dfe96c3e39614 (custom getter added "hash: ")
```

### API

#### [`SettingsContainerAbstract`](https://github.com/chillerlan/php-settings-container/blob/main/src/SettingsContainerAbstract.php)

| method                                     | return                       | info                                                                                                                |
|--------------------------------------------|------------------------------|---------------------------------------------------------------------------------------------------------------------|
| `__construct(iterable $properties = null)` | -                            | calls `construct()` internally after the properties have been set                                                   |
| (protected) `construct()`                  | void                         | calls a method with trait name as replacement constructor for each used trait                                       |
| `__get(string $property)`                  | mixed                        | calls `$this->{'get_'.$property}()` if such a method exists                                                         |
| `__set(string $property, $value)`          | void                         | calls `$this->{'set_'.$property}($value)` if such a method exists                                                   |
| `__isset(string $property)`                | bool                         |                                                                                                                     |
| `__unset(string $property)`                | void                         |                                                                                                                     |
| `__toString()`                             | string                       | a JSON string                                                                                                       |
| `toArray()`                                | array                        |                                                                                                                     |
| `fromIterable(iterable $properties)`       | `SettingsContainerInterface` |                                                                                                                     |
| `toJSON(int $jsonOptions = null)`          | string                       | accepts [JSON options constants](http://php.net/manual/json.constants.php)                                          |
| `fromJSON(string $json)`                   | `SettingsContainerInterface` |                                                                                                                     |
| `jsonSerialize()`                          | mixed                        | implements the [`JsonSerializable`](https://www.php.net/manual/en/jsonserializable.jsonserialize.php) interface     |
| `serialize()`                              | string                       | implements the [`Serializable`](https://www.php.net/manual/en/serializable.serialize.php) interface                 |
| `unserialize(string $data)`                | void                         | implements the [`Serializable`](https://www.php.net/manual/en/serializable.unserialize.php) interface               |
| `__serialize()`                            | array                        | implements the [`Serializable`](https://www.php.net/manual/en/language.oop5.magic.php#object.serialize) interface   |
| `__unserialize(array $data)`               | void                         | implements the [`Serializable`](https://www.php.net/manual/en/language.oop5.magic.php#object.unserialize) interface |

## Disclaimer
This might be either an utterly genius or completely stupid idea - you decide. However, i like it and it works.
Also, this is not a dependency injection container. Stop using DI containers FFS.
