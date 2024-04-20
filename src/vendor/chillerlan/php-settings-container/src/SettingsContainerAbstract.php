<?php
/**
 * Class SettingsContainerAbstract
 *
 * @created      28.08.2018
 * @author       Smiley <smiley@chillerlan.net>
 * @copyright    2018 Smiley
 * @license      MIT
 */
declare(strict_types=1);

namespace chillerlan\Settings;

use InvalidArgumentException, ReflectionClass, ReflectionProperty;
use function array_keys, get_object_vars, is_object, json_decode,
	json_encode, method_exists, property_exists, serialize, unserialize;
use const JSON_THROW_ON_ERROR;

abstract class SettingsContainerAbstract implements SettingsContainerInterface{

	/**
	 * SettingsContainerAbstract constructor.
	 */
	public function __construct(iterable|null $properties = null){

		if(!empty($properties)){
			$this->fromIterable($properties);
		}

		$this->construct();
	}

	/**
	 * calls a method with trait name as replacement constructor for each used trait
	 * (remember pre-php5 classname constructors? yeah, basically this.)
	 */
	protected function construct():void{
		$traits = (new ReflectionClass($this))->getTraits();

		foreach($traits as $trait){
			$method = $trait->getShortName();

			if(method_exists($this, $method)){
				$this->{$method}();
			}
		}

	}

	/**
	 * @inheritdoc
	 */
	public function __get(string $property):mixed{

		if(!property_exists($this, $property) || $this->isPrivate($property)){
			return null;
		}

		$method = 'get_'.$property;

		if(method_exists($this, $method)){
			return $this->{$method}();
		}

		return $this->{$property};
	}

	/**
	 * @inheritdoc
	 */
	public function __set(string $property, mixed $value):void{

		if(!property_exists($this, $property) || $this->isPrivate($property)){
			return;
		}

		$method = 'set_'.$property;

		if(method_exists($this, $method)){
			$this->{$method}($value);

			return;
		}

		$this->{$property} = $value;
	}

	/**
	 * @inheritdoc
	 */
	public function __isset(string $property):bool{
		return isset($this->{$property}) && !$this->isPrivate($property);
	}

	/**
	 * @internal Checks if a property is private
	 */
	protected function isPrivate(string $property):bool{
		return (new ReflectionProperty($this, $property))->isPrivate();
	}

	/**
	 * @inheritdoc
	 */
	public function __unset(string $property):void{

		if($this->__isset($property)){
			unset($this->{$property});
		}

	}

	/**
	 * @inheritdoc
	 */
	public function __toString():string{
		return $this->toJSON();
	}

	/**
	 * @inheritdoc
	 */
	public function toArray():array{
		$properties = [];

		foreach(array_keys(get_object_vars($this)) as $key){
			$properties[$key] = $this->__get($key);
		}

		return $properties;
	}

	/**
	 * @inheritdoc
	 */
	public function fromIterable(iterable $properties):static{

		foreach($properties as $key => $value){
			$this->__set($key, $value);
		}

		return $this;
	}

	/**
	 * @inheritdoc
	 */
	public function toJSON(int|null $jsonOptions = null):string{
		return json_encode($this, ($jsonOptions ?? 0));
	}

	/**
	 * @inheritdoc
	 */
	public function fromJSON(string $json):static{
		$data = json_decode($json, true, 512, JSON_THROW_ON_ERROR);

		return $this->fromIterable($data);
	}

	/**
	 * @inheritdoc
	 */
	public function jsonSerialize():array{
		return $this->toArray();
	}

	/**
	 * Returns a serialized string representation of the object in its current state (except static/readonly properties)
	 *
	 * @inheritdoc
	 * @see \chillerlan\Settings\SettingsContainerInterface::toArray()
	 */
	public function serialize():string{
		return serialize($this);
	}

	/**
	 * Restores the data (except static/readonly properties) from the given serialized object to the current instance
	 *
	 * @inheritdoc
	 * @see \chillerlan\Settings\SettingsContainerInterface::fromIterable()
	 */
	public function unserialize(string $data):void{
		$obj = unserialize($data);

		if($obj === false || !is_object($obj)){
			throw new InvalidArgumentException('The given serialized string is invalid');
		}

		$reflection = new ReflectionClass($obj);

		if(!$reflection->isInstance($this)){
			throw new InvalidArgumentException('The unserialized object does not match the class of this container');
		}

		$properties = $reflection->getProperties(~(ReflectionProperty::IS_STATIC | ReflectionProperty::IS_READONLY));

		foreach($properties as $reflectionProperty){
			$this->{$reflectionProperty->name} = $reflectionProperty->getValue($obj);
		}

	}

	/**
	 * Returns a serialized string representation of the object in its current state (except static/readonly properties)
	 *
	 * @inheritdoc
	 * @see \chillerlan\Settings\SettingsContainerInterface::toArray()
	 */
	public function __serialize():array{

		$properties = (new ReflectionClass($this))
			->getProperties(~(ReflectionProperty::IS_STATIC | ReflectionProperty::IS_READONLY))
		;

		$data = [];

		foreach($properties as $reflectionProperty){
			$data[$reflectionProperty->name] = $reflectionProperty->getValue($this);
		}

		return $data;
	}

	/**
	 * Restores the data from the given array to the current instance
	 *
	 * @inheritdoc
	 * @see \chillerlan\Settings\SettingsContainerInterface::fromIterable()
	 */
	public function __unserialize(array $data):void{

		foreach($data as $key => $value){
			$this->{$key} = $value;
		}

	}

}
