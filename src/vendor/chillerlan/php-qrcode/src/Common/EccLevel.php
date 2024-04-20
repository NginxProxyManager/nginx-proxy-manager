<?php
/**
 * Class EccLevel
 *
 * @created      19.11.2020
 * @author       smiley <smiley@chillerlan.net>
 * @copyright    2020 smiley
 * @license      MIT
 */

namespace chillerlan\QRCode\Common;

use chillerlan\QRCode\QRCodeException;
use function array_column;

/**
 * This class encapsulates the four error correction levels defined by the QR code standard.
 */
final class EccLevel{

	// ISO/IEC 18004:2000 Tables 12, 25

	/** @var int */
	public const L = 0b01; // 7%.
	/** @var int */
	public const M = 0b00; // 15%.
	/** @var int */
	public const Q = 0b11; // 25%.
	/** @var int */
	public const H = 0b10; // 30%.

	/**
	 * ISO/IEC 18004:2000 Tables 7-11 - Number of symbol characters and input data capacity for versions 1 to 40
	 *
	 * @var int[][]
	 */
	private const MAX_BITS = [
	//	[    L,     M,     Q,     H]  // v  => modules
		[    0,     0,     0,     0], // 0  =>  will be ignored, index starts at 1
		[  152,   128,   104,    72], // 1  =>  21
		[  272,   224,   176,   128], // 2  =>  25
		[  440,   352,   272,   208], // 3  =>  29
		[  640,   512,   384,   288], // 4  =>  33
		[  864,   688,   496,   368], // 5  =>  37
		[ 1088,   864,   608,   480], // 6  =>  41
		[ 1248,   992,   704,   528], // 7  =>  45
		[ 1552,  1232,   880,   688], // 8  =>  49
		[ 1856,  1456,  1056,   800], // 9  =>  53
		[ 2192,  1728,  1232,   976], // 10 =>  57
		[ 2592,  2032,  1440,  1120], // 11 =>  61
		[ 2960,  2320,  1648,  1264], // 12 =>  65
		[ 3424,  2672,  1952,  1440], // 13 =>  69 NICE!
		[ 3688,  2920,  2088,  1576], // 14 =>  73
		[ 4184,  3320,  2360,  1784], // 15 =>  77
		[ 4712,  3624,  2600,  2024], // 16 =>  81
		[ 5176,  4056,  2936,  2264], // 17 =>  85
		[ 5768,  4504,  3176,  2504], // 18 =>  89
		[ 6360,  5016,  3560,  2728], // 19 =>  93
		[ 6888,  5352,  3880,  3080], // 20 =>  97
		[ 7456,  5712,  4096,  3248], // 21 => 101
		[ 8048,  6256,  4544,  3536], // 22 => 105
		[ 8752,  6880,  4912,  3712], // 23 => 109
		[ 9392,  7312,  5312,  4112], // 24 => 113
		[10208,  8000,  5744,  4304], // 25 => 117
		[10960,  8496,  6032,  4768], // 26 => 121
		[11744,  9024,  6464,  5024], // 27 => 125
		[12248,  9544,  6968,  5288], // 28 => 129
		[13048, 10136,  7288,  5608], // 29 => 133
		[13880, 10984,  7880,  5960], // 30 => 137
		[14744, 11640,  8264,  6344], // 31 => 141
		[15640, 12328,  8920,  6760], // 32 => 145
		[16568, 13048,  9368,  7208], // 33 => 149
		[17528, 13800,  9848,  7688], // 34 => 153
		[18448, 14496, 10288,  7888], // 35 => 157
		[19472, 15312, 10832,  8432], // 36 => 161
		[20528, 15936, 11408,  8768], // 37 => 165
		[21616, 16816, 12016,  9136], // 38 => 169
		[22496, 17728, 12656,  9776], // 39 => 173
		[23648, 18672, 13328, 10208], // 40 => 177
	];

	/**
	 * ISO/IEC 18004:2000 Section 8.9 - Format Information
	 *
	 * ECC level -> mask pattern
	 *
	 * @var int[][]
	 */
	private const FORMAT_PATTERN = [
		[ // L
		  0b111011111000100,
		  0b111001011110011,
		  0b111110110101010,
		  0b111100010011101,
		  0b110011000101111,
		  0b110001100011000,
		  0b110110001000001,
		  0b110100101110110,
		],
		[ // M
		  0b101010000010010,
		  0b101000100100101,
		  0b101111001111100,
		  0b101101101001011,
		  0b100010111111001,
		  0b100000011001110,
		  0b100111110010111,
		  0b100101010100000,
		],
		[ // Q
		  0b011010101011111,
		  0b011000001101000,
		  0b011111100110001,
		  0b011101000000110,
		  0b010010010110100,
		  0b010000110000011,
		  0b010111011011010,
		  0b010101111101101,
		],
		[ // H
		  0b001011010001001,
		  0b001001110111110,
		  0b001110011100111,
		  0b001100111010000,
		  0b000011101100010,
		  0b000001001010101,
		  0b000110100001100,
		  0b000100000111011,
		],
	];

	/**
	 * The current ECC level value
	 *
	 * L: 0b01
	 * M: 0b00
	 * Q: 0b11
	 * H: 0b10
	 */
	private int $eccLevel;

	/**
	 * @param int $eccLevel containing the two bits encoding a QR Code's error correction level
	 *
	 * @todo: accept string values (PHP8+)
	 * @see https://github.com/chillerlan/php-qrcode/discussions/160
	 *
	 * @throws \chillerlan\QRCode\QRCodeException
	 */
	public function __construct(int $eccLevel){

		if((0b11 & $eccLevel) !== $eccLevel){
			throw new QRCodeException('invalid ECC level');
		}

		$this->eccLevel = $eccLevel;
	}

	/**
	 * returns the string representation of the current ECC level
	 */
	public function __toString():string{
		return [
			self::L => 'L',
			self::M => 'M',
			self::Q => 'Q',
			self::H => 'H',
		][$this->eccLevel];
	}

	/**
	 * returns the current ECC level
	 */
	public function getLevel():int{
		return $this->eccLevel;
	}

	/**
	 * returns the ordinal value of the current ECC level
	 *
	 * references to the keys of the following tables:
	 *
	 * @see \chillerlan\QRCode\Common\EccLevel::MAX_BITS
	 * @see \chillerlan\QRCode\Common\EccLevel::FORMAT_PATTERN
	 * @see \chillerlan\QRCode\Common\Version::RSBLOCKS
	 */
	public function getOrdinal():int{
		return [
			self::L => 0,
			self::M => 1,
			self::Q => 2,
			self::H => 3,
		][$this->eccLevel];
	}

	/**
	 * returns the format pattern for the given $eccLevel and $maskPattern
	 */
	public function getformatPattern(MaskPattern $maskPattern):int{
		return self::FORMAT_PATTERN[$this->getOrdinal()][$maskPattern->getPattern()];
	}

	/**
	 * returns an array with the max bit lengths for version 1-40 and the current ECC level
	 *
	 * @return int[]
	 */
	public function getMaxBits():array{
		$col = array_column(self::MAX_BITS, $this->getOrdinal());

		unset($col[0]); // remove the inavlid index 0

		return $col;
	}

	/**
	 * Returns the maximum bit length for the given version and current ECC level
	 */
	public function getMaxBitsForVersion(Version $version):int{
		return self::MAX_BITS[$version->getVersionNumber()][$this->getOrdinal()];
	}

}
