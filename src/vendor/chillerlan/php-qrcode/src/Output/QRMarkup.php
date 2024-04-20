<?php
/**
 * Class QRMarkup
 *
 * @created      17.12.2016
 * @author       Smiley <smiley@chillerlan.net>
 * @copyright    2016 Smiley
 * @license      MIT
 */

namespace chillerlan\QRCode\Output;

use function is_string, preg_match, strip_tags, trim;

/**
 * Abstract for markup types: HTML, SVG, ... XML anyone?
 */
abstract class QRMarkup extends QROutputAbstract{

	/**
	 * note: we're not necessarily validating the several values, just checking the general syntax
	 * note: css4 colors are not included
	 *
	 * @todo: XSS proof
	 *
	 * @see https://developer.mozilla.org/en-US/docs/Web/CSS/color_value
	 * @inheritDoc
	 */
	public static function moduleValueIsValid($value):bool{

		if(!is_string($value)){
			return false;
		}

		$value = trim(strip_tags($value), " '\"\r\n\t");

		// hex notation
		// #rgb(a)
		// #rrggbb(aa)
		if(preg_match('/^#([\da-f]{3}){1,2}$|^#([\da-f]{4}){1,2}$/i', $value)){
			return true;
		}

		// css: hsla/rgba(...values)
		if(preg_match('#^(hsla?|rgba?)\([\d .,%/]+\)$#i', $value)){
			return true;
		}

		// predefined css color
		if(preg_match('/^[a-z]+$/i', $value)){
			return true;
		}

		return false;
	}

	/**
	 * @inheritDoc
	 */
	protected function prepareModuleValue($value):string{
		return trim(strip_tags($value), " '\"\r\n\t");
	}

	/**
	 * @inheritDoc
	 */
	protected function getDefaultModuleValue(bool $isDark):string{
		return ($isDark) ? '#000' : '#fff';
	}

	/**
	 * @inheritDoc
	 */
	public function dump(string $file = null):string{
		$data = $this->createMarkup($file !== null);

		$this->saveToFile($data, $file);

		return $data;
	}

	/**
	 * returns a string with all css classes for the current element
	 */
	protected function getCssClass(int $M_TYPE = 0):string{
		return $this->options->cssClass;
	}

	/**
	 * returns the fully parsed and rendered markup string for the given input
	 */
	abstract protected function createMarkup(bool $saveToFile):string;

}
