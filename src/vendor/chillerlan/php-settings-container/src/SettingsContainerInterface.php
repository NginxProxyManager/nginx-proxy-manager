<?php
/**
 * Interface SettingsContainerInterface
 *
 * @created      28.08.2018
 * @author       Smiley <smiley@chillerlan.net>
 * @copyright    2018 Smiley
 * @license      MIT
 */
declare(strict_types=1);

namespace chillerlan\Settings;

use JsonSerializable, Serializable;

/**
 * a generic container with magic getter and setter
 */
interface SettingsContainerInterface extends JsonSerializable, Serializable{

	/**
	 * Retrieve the value of $property
	 *
	 * @return mixed|null
	 */
	public function __get(string $property):mixed;

	/**
	 * Set $property to $value while avoiding private and non-existing properties
	 */
	public function __set(string $property, mixed $value):void;

	/**
	 * Checks if $property is set (aka. not null), excluding private properties
	 */
	public function __isset(string $property):bool;

	/**
	 * Unsets $property while avoiding private and non-existing properties
	 */
	public function __unset(string $property):void;

	/**
	 * @see \chillerlan\Settings\SettingsContainerInterface::toJSON()
	 */
	public function __toString():string;

	/**
	 * Returns an array representation of the settings object
	 *
	 * The values will be run through the magic __get(), which may also call custom getters.
	 */
	public function toArray():array;

	/**
	 * Sets properties from a given iterable
	 *
	 * The values will be run through the magic __set(), which may also call custom setters.
	 */
	public function fromIterable(iterable $properties):static;

	/**
	 * Returns a JSON representation of the settings object
	 * @see \json_encode()
	 * @see \chillerlan\Settings\SettingsContainerInterface::toArray()
	 */
	public function toJSON(int|null $jsonOptions = null):string;

	/**
	 * Sets properties from a given JSON string
	 *
	 * @throws \Exception
	 * @throws \JsonException
	 * @see \chillerlan\Settings\SettingsContainerInterface::fromIterable()
	 */
	public function fromJSON(string $json):static;

}
