<?php
/**
 * Class Hanzi
 *
 * @created      19.11.2020
 * @author       smiley <smiley@chillerlan.net>
 * @copyright    2020 smiley
 * @license      MIT
 */

namespace chillerlan\QRCode\Data;

use chillerlan\QRCode\Common\{BitBuffer, Mode};
use Throwable;
use function chr, implode, intdiv, is_string, mb_convert_encoding, mb_detect_encoding,
	mb_detect_order, mb_internal_encoding, mb_strlen, ord, sprintf, strlen;

/**
 * Hanzi (simplified Chinese) mode, GBT18284-2000: 13-bit double-byte characters from the GB2312/GB18030 character set
 *
 * Please note that this is not part of the QR Code specification and may not be supported by all readers (ZXing-based ones do).
 *
 * @see https://en.wikipedia.org/wiki/GB_2312
 * @see http://www.herongyang.com/GB2312/Introduction-of-GB2312.html
 * @see https://en.wikipedia.org/wiki/GBK_(character_encoding)#Encoding
 * @see https://gist.github.com/codemasher/91da33c44bfb48a81a6c1426bb8e4338
 * @see https://github.com/zxing/zxing/blob/dfb06fa33b17a9e68321be151c22846c7b78048f/core/src/main/java/com/google/zxing/qrcode/decoder/DecodedBitStreamParser.java#L172-L209
 * @see https://www.chinesestandard.net/PDF/English.aspx/GBT18284-2000
 */
final class Hanzi extends QRDataModeAbstract{

	/**
	 * possible values: GB2312, GB18030
	 *
	 * @var string
	 */
	public const ENCODING = 'GB18030';

	/**
	 * @todo: other subsets???
	 *
	 * @var int
	 */
	public const GB2312_SUBSET = 0b0001;

	/**
	 * @inheritDoc
	 */
	public const DATAMODE = Mode::HANZI;

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
		mb_detect_order([mb_internal_encoding(), 'UTF-8', 'GB2312', 'GB18030', 'CP936', 'EUC-CN', 'HZ']);

		$detected = mb_detect_encoding($string, null, true);

		if($detected === false){
			throw new QRCodeDataException('mb_detect_encoding error');
		}

		if($detected === self::ENCODING){
			return $string;
		}

		$string = mb_convert_encoding($string, self::ENCODING, $detected);

		if(!is_string($string)){
			throw new QRCodeDataException('mb_convert_encoding error');
		}

		return $string;
	}

	/**
	 * checks if a string qualifies as Hanzi/GB2312
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

			// byte 1 unused ranges
			if($byte1 < 0xa1 || ($byte1 > 0xa9 && $byte1 < 0xb0) || $byte1 > 0xf7){
				return false;
			}

			// byte 2 unused ranges
			if($byte2 < 0xa1 || $byte2 > 0xfe){
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
			->put($this::GB2312_SUBSET, 4)
			->put($this->getCharCount(), $this::getLengthBits($versionNumber))
		;

		$len = strlen($this->data);

		for($i = 0; ($i + 1) < $len; $i += 2){
			$c = (((0xff & ord($this->data[$i])) << 8) | (0xff & ord($this->data[($i + 1)])));

			if($c >= 0xa1a1 && $c <= 0xaafe){
				$c -= 0x0a1a1;
			}
			elseif($c >= 0xb0a1 && $c <= 0xfafe){
				$c -= 0x0a6a1;
			}
			else{
				throw new QRCodeDataException(sprintf('illegal char at %d [%d]', ($i + 1), $c));
			}

			$bitBuffer->put((((($c >> 8) & 0xff) * 0x060) + ($c & 0xff)), 13);
		}

		if($i < $len){
			throw new QRCodeDataException(sprintf('illegal char at %d', ($i + 1)));
		}

		return $this;
	}

	/**
	 * See specification GBT 18284-2000
	 *
	 * @throws \chillerlan\QRCode\Data\QRCodeDataException
	 */
	public static function decodeSegment(BitBuffer $bitBuffer, int $versionNumber):string{

		// Hanzi mode contains a subset indicator right after mode indicator
		if($bitBuffer->read(4) !== self::GB2312_SUBSET){
			throw new QRCodeDataException('ecpected subset indicator for Hanzi mode');
		}

		$length = $bitBuffer->read(self::getLengthBits($versionNumber));

		if($bitBuffer->available() < ($length * 13)){
			throw new QRCodeDataException('not enough bits available');
		}

		// Each character will require 2 bytes. Read the characters as 2-byte pairs and decode as GB2312 afterwards
		$buffer = [];
		$offset = 0;

		while($length > 0){
			// Each 13 bits encodes a 2-byte character
			$twoBytes          = $bitBuffer->read(13);
			$assembledTwoBytes = ((intdiv($twoBytes, 0x060) << 8) | ($twoBytes % 0x060));

			$assembledTwoBytes += ($assembledTwoBytes < 0x00a00) // 0x003BF
				? 0x0a1a1  // In the 0xA1A1 to 0xAAFE range
				: 0x0a6a1; // In the 0xB0A1 to 0xFAFE range

			$buffer[$offset]       = chr(0xff & ($assembledTwoBytes >> 8));
			$buffer[($offset + 1)] = chr(0xff & $assembledTwoBytes);
			$offset                += 2;
			$length--;
		}

		return mb_convert_encoding(implode($buffer), mb_internal_encoding(), self::ENCODING);
	}

}
