<?php
/**
 * Class QRString
 *
 * @created      05.12.2015
 * @author       Smiley <smiley@chillerlan.net>
 * @copyright    2015 Smiley
 * @license      MIT
 *
 * @noinspection PhpComposerExtensionStubsInspection
 */

namespace chillerlan\QRCode\Output;

use function implode, is_string, json_encode, max, min, sprintf;
use const JSON_THROW_ON_ERROR;

/**
 * Converts the matrix data into string types
 *
 * @deprecated 5.0.0 this class will be removed in future versions, use one of QRStringText or QRStringJSON instead
 */
class QRString extends QROutputAbstract{

	/**
	 * @inheritDoc
	 */
	public static function moduleValueIsValid($value):bool{
		return is_string($value);
	}

	/**
	 * @inheritDoc
	 */
	protected function prepareModuleValue($value):string{
		return $value;
	}

	/**
	 * @inheritDoc
	 */
	protected function getDefaultModuleValue(bool $isDark):string{
		return ($isDark) ? '██' : '░░';
	}

	/**
	 * @inheritDoc
	 */
	public function dump(string $file = null):string{

		switch($this->options->outputType){
			case QROutputInterface::STRING_TEXT:
				$data = $this->text();
				break;
			case QROutputInterface::STRING_JSON:
			default:
				$data = $this->json();
		}

		$this->saveToFile($data, $file);

		return $data;
	}

	/**
	 * string output
	 */
	protected function text():string{
		$lines     = [];
		$linestart = $this->options->textLineStart;

		for($y = 0; $y < $this->moduleCount; $y++){
			$r = [];

			for($x = 0; $x < $this->moduleCount; $x++){
				$r[] = $this->getModuleValueAt($x, $y);
			}

			$lines[] = $linestart.implode('', $r);
		}

		return implode($this->eol, $lines);
	}

	/**
	 * JSON output
	 *
	 * @throws \JsonException
	 */
	protected function json():string{
		return json_encode($this->matrix->getMatrix($this->options->jsonAsBooleans), JSON_THROW_ON_ERROR);
	}

	//

	/**
	 * a little helper to create a proper ANSI 8-bit color escape sequence
	 *
	 * @see https://en.wikipedia.org/wiki/ANSI_escape_code#8-bit
	 * @see https://en.wikipedia.org/wiki/Block_Elements
	 *
	 * @codeCoverageIgnore
	 */
	public static function ansi8(string $str, int $color, bool $background = null):string{
		$color      = max(0, min($color, 255));
		$background = ($background === true) ? 48 : 38;

		return sprintf("\x1b[%s;5;%sm%s\x1b[0m", $background, $color, $str);
	}

}
