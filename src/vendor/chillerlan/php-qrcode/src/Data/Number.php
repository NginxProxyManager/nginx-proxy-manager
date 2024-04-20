<?php
/**
 * Class Number
 *
 * @created      26.11.2015
 * @author       Smiley <smiley@chillerlan.net>
 * @copyright    2015 Smiley
 * @license      MIT
 */

namespace chillerlan\QRCode\Data;

use chillerlan\QRCode\Common\{BitBuffer, Mode};
use function array_flip, ceil, intdiv, str_split, substr, unpack;

/**
 * Numeric mode: decimal digits 0 to 9
 *
 * ISO/IEC 18004:2000 Section 8.3.2
 * ISO/IEC 18004:2000 Section 8.4.2
 */
final class Number extends QRDataModeAbstract{

	/**
	 * @var int[]
	 */
	private const NUMBER_TO_ORD = [
		'0' => 0, '1' => 1, '2' => 2, '3' => 3, '4' => 4, '5' => 5, '6' => 6, '7' => 7, '8' => 8, '9' => 9,
	];

	/**
	 * @inheritDoc
	 */
	public const DATAMODE = Mode::NUMBER;

	/**
	 * @inheritDoc
	 */
	public function getLengthInBits():int{
		return (int)ceil($this->getCharCount() * (10 / 3));
	}

	/**
	 * @inheritDoc
	 */
	public static function validateString(string $string):bool{

		if($string === ''){
			return false;
		}

		foreach(str_split($string) as $chr){
			if(!isset(self::NUMBER_TO_ORD[$chr])){
				return false;
			}
		}

		return true;
	}

	/**
	 * @inheritDoc
	 */
	public function write(BitBuffer $bitBuffer, int $versionNumber):QRDataModeInterface{
		$len = $this->getCharCount();

		$bitBuffer
			->put(self::DATAMODE, 4)
			->put($len, $this::getLengthBits($versionNumber))
		;

		$i = 0;

		// encode numeric triplets in 10 bits
		while(($i + 2) < $len){
			$bitBuffer->put($this->parseInt(substr($this->data, $i, 3)), 10);
			$i += 3;
		}

		if($i < $len){

			// encode 2 remaining numbers in 7 bits
			if(($len - $i) === 2){
				$bitBuffer->put($this->parseInt(substr($this->data, $i, 2)), 7);
			}
			// encode one remaining number in 4 bits
			elseif(($len - $i) === 1){
				$bitBuffer->put($this->parseInt(substr($this->data, $i, 1)), 4);
			}

		}

		return $this;
	}

	/**
	 * get the code for the given numeric string
	 */
	private function parseInt(string $string):int{
		$num = 0;

		foreach(unpack('C*', $string) as $chr){
			$num = ($num * 10 + $chr - 48);
		}

		return $num;
	}

	/**
	 * @inheritDoc
	 *
	 * @throws \chillerlan\QRCode\Data\QRCodeDataException
	 */
	public static function decodeSegment(BitBuffer $bitBuffer, int $versionNumber):string{
		$length  = $bitBuffer->read(self::getLengthBits($versionNumber));
		$charmap = array_flip(self::NUMBER_TO_ORD);

		// @todo
		$toNumericChar = function(int $ord) use ($charmap):string{

			if(isset($charmap[$ord])){
				return $charmap[$ord];
			}

			throw new QRCodeDataException('invalid character value: '.$ord);
		};

		$result = '';
		// Read three digits at a time
		while($length >= 3){
			// Each 10 bits encodes three digits
			if($bitBuffer->available() < 10){
				throw new QRCodeDataException('not enough bits available'); // @codeCoverageIgnore
			}

			$threeDigitsBits = $bitBuffer->read(10);

			if($threeDigitsBits >= 1000){
				throw new QRCodeDataException('error decoding numeric value');
			}

			$result .= $toNumericChar(intdiv($threeDigitsBits, 100));
			$result .= $toNumericChar(intdiv($threeDigitsBits, 10) % 10);
			$result .= $toNumericChar($threeDigitsBits % 10);

			$length -= 3;
		}

		if($length === 2){
			// Two digits left over to read, encoded in 7 bits
			if($bitBuffer->available() < 7){
				throw new QRCodeDataException('not enough bits available'); // @codeCoverageIgnore
			}

			$twoDigitsBits = $bitBuffer->read(7);

			if($twoDigitsBits >= 100){
				throw new QRCodeDataException('error decoding numeric value');
			}

			$result .= $toNumericChar(intdiv($twoDigitsBits, 10));
			$result .= $toNumericChar($twoDigitsBits % 10);
		}
		elseif($length === 1){
			// One digit left over to read
			if($bitBuffer->available() < 4){
				throw new QRCodeDataException('not enough bits available'); // @codeCoverageIgnore
			}

			$digitBits = $bitBuffer->read(4);

			if($digitBits >= 10){
				throw new QRCodeDataException('error decoding numeric value');
			}

			$result .= $toNumericChar($digitBits);
		}

		return $result;
	}

}
