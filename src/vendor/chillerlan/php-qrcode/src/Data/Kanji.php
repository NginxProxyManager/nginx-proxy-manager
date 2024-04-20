<?php
/**
 * Class Kanji
 *
 * @created      25.11.2015
 * @author       Smiley <smiley@chillerlan.net>
 * @copyright    2015 Smiley
 * @license      MIT
 */

namespace chillerlan\QRCode\Data;

use chillerlan\QRCode\Common\{BitBuffer, Mode};
use Throwable;
use function chr, implode, intdiv, is_string, mb_convert_encoding, mb_detect_encoding,
	mb_detect_order, mb_internal_encoding, mb_strlen, ord, sprintf, strlen;

/**
 * Kanji mode: 13-bit double-byte characters from the Shift-JIS character set
 *
 * ISO/IEC 18004:2000 Section 8.3.5
 * ISO/IEC 18004:2000 Section 8.4.5
 *
 * @see https://en.wikipedia.org/wiki/Shift_JIS#As_defined_in_JIS_X_0208:1997
 * @see http://www.rikai.com/library/kanjitables/kanji_codes.sjis.shtml
 * @see https://gist.github.com/codemasher/d07d3e6e9346c08e7a41b8b978784952
 */
final class Kanji extends QRDataModeAbstract{

	/**
	 * possible values: SJIS, SJIS-2004
	 *
	 * SJIS-2004 may produce errors in PHP < 8
	 *
	 * @var string
	 */
	public const ENCODING = 'SJIS';

	/**
	 * @inheritDoc
	 */
	public const DATAMODE = Mode::KANJI;

	/**
	 * @inheritDoc
	 */
	protected function getCharCount():int{
		return mb_strlen($this->data, self::ENCODING);
	}

	/**
	 * @inheritDoc
	 */
	public function getLengthInBits():int{
		return ($this->getCharCount() * 13);
	}

	/**
	 * @inheritDoc
	 */
	public static function convertEncoding(string $string):string{
		mb_detect_order([mb_internal_encoding(), 'UTF-8', 'SJIS', 'SJIS-2004']);

		$detected = mb_detect_encoding($string, null, true);

		if($detected === false){
			throw new QRCodeDataException('mb_detect_encoding error');
		}

		if($detected === self::ENCODING){
			return $string;
		}

		$string = mb_convert_encoding($string, self::ENCODING, $detected);

		if(!is_string($string)){
			throw new QRCodeDataException(sprintf('invalid encoding: %s', $detected));
		}

		return $string;
	}

	/**
	 * checks if a string qualifies as SJIS Kanji
	 */
	public static function validateString(string $string):bool{

		try{
			$string = self::convertEncoding($string);
		}
		catch(Throwable $e){
			return false;
		}

		$len = strlen($string);

		if($len < 2 || ($len % 2) !== 0){
			return false;
		}

		for($i = 0; $i < $len; $i += 2){
			$byte1 = ord($string[$i]);
			$byte2 = ord($string[($i + 1)]);

			// byte 1 unused and vendor ranges
			if($byte1 < 0x81 || ($byte1 > 0x84 && $byte1 < 0x88) || ($byte1 > 0x9f && $byte1 < 0xe0) ||  $byte1 > 0xea){
				return false;
			}

			// byte 2 unused ranges
			if($byte2 < 0x40 || $byte2 === 0x7f || $byte2 > 0xfc){
				return false;
			}

		}

		return true;
	}

	/**
	 * @inheritDoc
	 *
	 * @throws \chillerlan\QRCode\Data\QRCodeDataException on an illegal character occurence
	 */
	public function write(BitBuffer $bitBuffer, int $versionNumber):QRDataModeInterface{

		$bitBuffer
			->put(self::DATAMODE, 4)
			->put($this->getCharCount(), $this::getLengthBits($versionNumber))
		;

		$len = strlen($this->data);

		for($i = 0; ($i + 1) < $len; $i += 2){
			$c = (((0xff & ord($this->data[$i])) << 8) | (0xff & ord($this->data[($i + 1)])));

			if($c >= 0x8140 && $c <= 0x9ffc){
				$c -= 0x8140;
			}
			elseif($c >= 0xe040 && $c <= 0xebbf){
				$c -= 0xc140;
			}
			else{
				throw new QRCodeDataException(sprintf('illegal char at %d [%d]', ($i + 1), $c));
			}

			$bitBuffer->put((((($c >> 8) & 0xff) * 0xc0) + ($c & 0xff)), 13);
		}

		if($i < $len){
			throw new QRCodeDataException(sprintf('illegal char at %d', ($i + 1)));
		}

		return $this;
	}

	/**
	 * @inheritDoc
	 *
	 * @throws \chillerlan\QRCode\Data\QRCodeDataException
	 */
	public static function decodeSegment(BitBuffer $bitBuffer, int $versionNumber):string{
		$length = $bitBuffer->read(self::getLengthBits($versionNumber));

		if($bitBuffer->available() < ($length * 13)){
			throw new QRCodeDataException('not enough bits available');  // @codeCoverageIgnore
		}

		// Each character will require 2 bytes. Read the characters as 2-byte pairs and decode as SJIS afterwards
		$buffer = [];
		$offset = 0;

		while($length > 0){
			// Each 13 bits encodes a 2-byte character
			$twoBytes          = $bitBuffer->read(13);
			$assembledTwoBytes = ((intdiv($twoBytes, 0x0c0) << 8) | ($twoBytes % 0x0c0));

			$assembledTwoBytes += ($assembledTwoBytes < 0x01f00)
				? 0x08140  // In the 0x8140 to 0x9FFC range
				: 0x0c140; // In the 0xE040 to 0xEBBF range

			$buffer[$offset]       = chr(0xff & ($assembledTwoBytes >> 8));
			$buffer[($offset + 1)] = chr(0xff & $assembledTwoBytes);
			$offset                += 2;
			$length--;
		}

		return mb_convert_encoding(implode($buffer), mb_internal_encoding(), self::ENCODING);
	}

}
