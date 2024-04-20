<?php
/**
 * Class AlphaNum
 *
 * @created      25.11.2015
 * @author       Smiley <smiley@chillerlan.net>
 * @copyright    2015 Smiley
 * @license      MIT
 */

namespace chillerlan\QRCode\Data;

use chillerlan\QRCode\Common\{BitBuffer, Mode};
use function array_flip, ceil, intdiv, str_split;

/**
 * Alphanumeric mode: 0 to 9, A to Z, space, $ % * + - . / :
 *
 * ISO/IEC 18004:2000 Section 8.3.3
 * ISO/IEC 18004:2000 Section 8.4.3
 */
final class AlphaNum extends QRDataModeAbstract{

	/**
	 * ISO/IEC 18004:2000 Table 5
	 *
	 * @var int[]
	 */
	private const CHAR_TO_ORD = [
		'0' =>  0, '1' =>  1, '2' =>  2, '3' =>  3, '4' =>  4, '5' =>  5, '6' =>  6, '7' =>  7,
		'8' =>  8, '9' =>  9, 'A' => 10, 'B' => 11, 'C' => 12, 'D' => 13, 'E' => 14, 'F' => 15,
		'G' => 16, 'H' => 17, 'I' => 18, 'J' => 19, 'K' => 20, 'L' => 21, 'M' => 22, 'N' => 23,
		'O' => 24, 'P' => 25, 'Q' => 26, 'R' => 27, 'S' => 28, 'T' => 29, 'U' => 30, 'V' => 31,
		'W' => 32, 'X' => 33, 'Y' => 34, 'Z' => 35, ' ' => 36, '$' => 37, '%' => 38, '*' => 39,
		'+' => 40, '-' => 41, '.' => 42, '/' => 43, ':' => 44,
	];

	/**
	 * @inheritDoc
	 */
	public const DATAMODE = Mode::ALPHANUM;

	/**
	 * @inheritDoc
	 */
	public function getLengthInBits():int{
		return (int)ceil($this->getCharCount() * (11 / 2));
	}

	/**
	 * @inheritDoc
	 */
	public static function validateString(string $string):bool{

		if($string === ''){
			return false;
		}

		foreach(str_split($string) as $chr){
			if(!isset(self::CHAR_TO_ORD[$chr])){
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

		// encode 2 characters in 11 bits
		for($i = 0; ($i + 1) < $len; $i += 2){
			$bitBuffer->put((self::CHAR_TO_ORD[$this->data[$i]] * 45 + self::CHAR_TO_ORD[$this->data[($i + 1)]]), 11);
		}

		// encode a remaining character in 6 bits
		if($i < $len){
			$bitBuffer->put(self::CHAR_TO_ORD[$this->data[$i]], 6);
		}

		return $this;
	}

	/**
	 * @inheritDoc
	 *
	 * @throws \chillerlan\QRCode\Data\QRCodeDataException
	 */
	public static function decodeSegment(BitBuffer $bitBuffer, int $versionNumber):string{
		$length  = $bitBuffer->read(self::getLengthBits($versionNumber));
		$charmap = array_flip(self::CHAR_TO_ORD);

		// @todo
		$toAlphaNumericChar = function(int $ord) use ($charmap):string{

			if(isset($charmap[$ord])){
				return $charmap[$ord];
			}

			throw new QRCodeDataException('invalid character value: '.$ord);
		};

		$result = '';
		// Read two characters at a time
		while($length > 1){

			if($bitBuffer->available() < 11){
				throw new QRCodeDataException('not enough bits available'); // @codeCoverageIgnore
			}

			$nextTwoCharsBits = $bitBuffer->read(11);
			$result           .= $toAlphaNumericChar(intdiv($nextTwoCharsBits, 45));
			$result           .= $toAlphaNumericChar($nextTwoCharsBits % 45);
			$length           -= 2;
		}

		if($length === 1){
			// special case: one character left
			if($bitBuffer->available() < 6){
				throw new QRCodeDataException('not enough bits available'); // @codeCoverageIgnore
			}

			$result .= $toAlphaNumericChar($bitBuffer->read(6));
		}

		return $result;
	}

}
