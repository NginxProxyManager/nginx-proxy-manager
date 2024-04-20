<?php
/**
 * Class ECICharset
 *
 * @created      21.01.2021
 * @author       ZXing Authors
 * @author       smiley <smiley@chillerlan.net>
 * @copyright    2021 smiley
 * @license      Apache-2.0
 */

namespace chillerlan\QRCode\Common;

use chillerlan\QRCode\QRCodeException;
use function sprintf;

/**
 * ISO/IEC 18004:2000 - 8.4.1 Extended Channel Interpretation (ECI) Mode
 */
final class ECICharset{

	public const CP437                 = 0;  // Code page 437, DOS Latin US
	public const ISO_IEC_8859_1_GLI    = 1;  // GLI encoding with characters 0 to 127 identical to ISO/IEC 646 and characters 128 to 255 identical to ISO 8859-1
	public const CP437_WO_GLI          = 2;  // An equivalent code table to CP437, without the return-to-GLI 0 logic
	public const ISO_IEC_8859_1        = 3;  // Latin-1 (Default)
	public const ISO_IEC_8859_2        = 4;  // Latin-2
	public const ISO_IEC_8859_3        = 5;  // Latin-3
	public const ISO_IEC_8859_4        = 6;  // Latin-4
	public const ISO_IEC_8859_5        = 7;  // Latin/Cyrillic
	public const ISO_IEC_8859_6        = 8;  // Latin/Arabic
	public const ISO_IEC_8859_7        = 9;  // Latin/Greek
	public const ISO_IEC_8859_8        = 10; // Latin/Hebrew
	public const ISO_IEC_8859_9        = 11; // Latin-5
	public const ISO_IEC_8859_10       = 12; // Latin-6
	public const ISO_IEC_8859_11       = 13; // Latin/Thai
	// 14 reserved
	public const ISO_IEC_8859_13       = 15; // Latin-7 (Baltic Rim)
	public const ISO_IEC_8859_14       = 16; // Latin-8 (Celtic)
	public const ISO_IEC_8859_15       = 17; // Latin-9
	public const ISO_IEC_8859_16       = 18; // Latin-10
	// 19 reserved
	public const SHIFT_JIS             = 20; // JIS X 0208 Annex 1 + JIS X 0201
	public const WINDOWS_1250_LATIN_2  = 21; // Superset of Latin-2, Central Europe
	public const WINDOWS_1251_CYRILLIC = 22; // Latin/Cyrillic
	public const WINDOWS_1252_LATIN_1  = 23; // Superset of Latin-1
	public const WINDOWS_1256_ARABIC   = 24;
	public const ISO_IEC_10646_UCS_2   = 25; // High order byte first (UTF-16BE)
	public const ISO_IEC_10646_UTF_8   = 26; // UTF-8
	public const ISO_IEC_646_1991      = 27; // International Reference Version of ISO 7-bit coded character set (US-ASCII)
	public const BIG5                  = 28; // Big 5 (Taiwan) Chinese Character Set
	public const GB18030               = 29; // GB (PRC) Chinese Character Set
	public const EUC_KR                = 30; // Korean Character Set

	/**
	 * map of charset id -> name
	 *
	 * @see \mb_list_encodings()
	 */
	public const MB_ENCODINGS = [
		self::CP437                 => null,
		self::ISO_IEC_8859_1_GLI    => null,
		self::CP437_WO_GLI          => null,
		self::ISO_IEC_8859_1        => 'ISO-8859-1',
		self::ISO_IEC_8859_2        => 'ISO-8859-2',
		self::ISO_IEC_8859_3        => 'ISO-8859-3',
		self::ISO_IEC_8859_4        => 'ISO-8859-4',
		self::ISO_IEC_8859_5        => 'ISO-8859-5',
		self::ISO_IEC_8859_6        => 'ISO-8859-6',
		self::ISO_IEC_8859_7        => 'ISO-8859-7',
		self::ISO_IEC_8859_8        => 'ISO-8859-8',
		self::ISO_IEC_8859_9        => 'ISO-8859-9',
		self::ISO_IEC_8859_10       => 'ISO-8859-10',
		self::ISO_IEC_8859_11       => null,
		self::ISO_IEC_8859_13       => 'ISO-8859-13',
		self::ISO_IEC_8859_14       => 'ISO-8859-14',
		self::ISO_IEC_8859_15       => 'ISO-8859-15',
		self::ISO_IEC_8859_16       => 'ISO-8859-16',
		self::SHIFT_JIS             => 'SJIS',
		self::WINDOWS_1250_LATIN_2  => null, // @see https://www.php.net/manual/en/function.mb-convert-encoding.php#112547
		self::WINDOWS_1251_CYRILLIC => 'Windows-1251',
		self::WINDOWS_1252_LATIN_1  => 'Windows-1252',
		self::WINDOWS_1256_ARABIC   => null, // @see https://stackoverflow.com/a/8592995
		self::ISO_IEC_10646_UCS_2   => 'UTF-16BE',
		self::ISO_IEC_10646_UTF_8   => 'UTF-8',
		self::ISO_IEC_646_1991      => 'ASCII',
		self::BIG5                  => 'BIG-5',
		self::GB18030               => 'GB18030',
		self::EUC_KR                => 'EUC-KR',
	];

	/**
	 * The current ECI character set ID
	 */
	private int $charsetID;

	/**
	 * @throws \chillerlan\QRCode\QRCodeException
	 */
	public function __construct(int $charsetID){

		if($charsetID < 0 || $charsetID > 999999){
			throw new QRCodeException(sprintf('invalid charset id: "%s"', $charsetID));
		}

		$this->charsetID = $charsetID;
	}

	/**
	 * Returns the current character set ID
	 */
	public function getID():int{
		return $this->charsetID;
	}

	/**
	 * Returns the name of the current character set or null if no name is available
	 *
	 * @see \mb_convert_encoding()
	 * @see \iconv()
	 */
	public function getName():?string{
		return (self::MB_ENCODINGS[$this->charsetID] ?? null);
	}

}
