<?php
/**
 * Class BitMatrix
 *
 * @created      17.01.2021
 * @author       ZXing Authors
 * @author       Smiley <smiley@chillerlan.net>
 * @copyright    2021 Smiley
 * @license      Apache-2.0
 */

namespace chillerlan\QRCode\Decoder;

use chillerlan\QRCode\Common\{EccLevel, MaskPattern, Version};
use chillerlan\QRCode\Data\{QRCodeDataException, QRMatrix};
use function array_fill, array_reverse, count;
use const PHP_INT_MAX, PHP_INT_SIZE;

/**
 * Extended QRMatrix to map read data from the Binarizer
 */
final class BitMatrix extends QRMatrix{

	/**
	 * See ISO 18004:2006, Annex C, Table C.1
	 *
	 * [data bits, sequence after masking]
	 */
	private const DECODE_LOOKUP = [
		0x5412, // 0101010000010010
		0x5125, // 0101000100100101
		0x5E7C, // 0101111001111100
		0x5B4B, // 0101101101001011
		0x45F9, // 0100010111111001
		0x40CE, // 0100000011001110
		0x4F97, // 0100111110010111
		0x4AA0, // 0100101010100000
		0x77C4, // 0111011111000100
		0x72F3, // 0111001011110011
		0x7DAA, // 0111110110101010
		0x789D, // 0111100010011101
		0x662F, // 0110011000101111
		0x6318, // 0110001100011000
		0x6C41, // 0110110001000001
		0x6976, // 0110100101110110
		0x1689, // 0001011010001001
		0x13BE, // 0001001110111110
		0x1CE7, // 0001110011100111
		0x19D0, // 0001100111010000
		0x0762, // 0000011101100010
		0x0255, // 0000001001010101
		0x0D0C, // 0000110100001100
		0x083B, // 0000100000111011
		0x355F, // 0011010101011111
		0x3068, // 0011000001101000
		0x3F31, // 0011111100110001
		0x3A06, // 0011101000000110
		0x24B4, // 0010010010110100
		0x2183, // 0010000110000011
		0x2EDA, // 0010111011011010
		0x2BED, // 0010101111101101
	];

	private const FORMAT_INFO_MASK_QR = 0x5412; // 0101010000010010

	/**
	 * This flag has effect only on the copyVersionBit() method.
	 * Before proceeding with readCodewords() the resetInfo() method should be called.
	 */
	private bool $mirror = false;

	/**
	 * @noinspection PhpMissingParentConstructorInspection
	 */
	public function __construct(int $dimension){
		$this->moduleCount = $dimension;
		$this->matrix      = array_fill(0, $this->moduleCount, array_fill(0, $this->moduleCount, $this::M_NULL));
	}

	/**
	 * Resets the current version info in order to attempt another reading
	 */
	public function resetVersionInfo():self{
		$this->version     = null;
		$this->eccLevel    = null;
		$this->maskPattern = null;

		return $this;
	}

	/**
	 * Mirror the bit matrix diagonally in order to attempt a second reading.
	 */
	public function mirrorDiagonal():self{
		$this->mirror = !$this->mirror;

		// mirror vertically
		$this->matrix = array_reverse($this->matrix);
		// rotate by 90 degrees clockwise
		/** @phan-suppress-next-line PhanTypeMismatchReturnSuperType */
		return $this->rotate90();
	}

	/**
	 * Reads the bits in the BitMatrix representing the finder pattern in the
	 * correct order in order to reconstruct the codewords bytes contained within the
	 * QR Code. Throws if the exact number of bytes expected is not read.
	 *
	 * @throws \chillerlan\QRCode\Decoder\QRCodeDecoderException
	 */
	public function readCodewords():array{

		$this
			->readFormatInformation()
			->readVersion()
			->mask($this->maskPattern) // reverse the mask pattern
		;

		// invoke a fresh matrix with only the function & format patterns to compare against
		$matrix = (new QRMatrix($this->version, $this->eccLevel))
			->initFunctionalPatterns()
			->setFormatInfo($this->maskPattern)
		;

		$result    = [];
		$byte      = 0;
		$bitsRead  = 0;
		$direction = true;

		// Read columns in pairs, from right to left
		for($i = ($this->moduleCount - 1); $i > 0; $i -= 2){

			// Skip whole column with vertical alignment pattern;
			// saves time and makes the other code proceed more cleanly
			if($i === 6){
				$i--;
			}
			// Read alternatingly from bottom to top then top to bottom
			for($count = 0; $count < $this->moduleCount; $count++){
				$y = ($direction) ? ($this->moduleCount - 1 - $count) : $count;

				for($col = 0; $col < 2; $col++){
					$x = ($i - $col);

					// Ignore bits covered by the function pattern
					if($matrix->get($x, $y) !== $this::M_NULL){
						continue;
					}

					$bitsRead++;
					$byte <<= 1;

					if($this->check($x, $y)){
						$byte |= 1;
					}
					// If we've made a whole byte, save it off
					if($bitsRead === 8){
						$result[] = $byte;
						$bitsRead = 0;
						$byte     = 0;
					}
				}
			}

			$direction = !$direction; // switch directions
		}

		if(count($result) !== $this->version->getTotalCodewords()){
			throw new QRCodeDecoderException('result count differs from total codewords for version');
		}

		// bytes encoded within the QR Code
		return $result;
	}

	/**
	 * Reads format information from one of its two locations within the QR Code.
	 * Throws if both format information locations cannot be parsed as the valid encoding of format information.
	 *
	 * @throws \chillerlan\QRCode\Decoder\QRCodeDecoderException
	 */
	private function readFormatInformation():self{

		if($this->eccLevel !== null && $this->maskPattern !== null){
			return $this;
		}

		// Read top-left format info bits
		$formatInfoBits1 = 0;

		for($i = 0; $i < 6; $i++){
			$formatInfoBits1 = $this->copyVersionBit($i, 8, $formatInfoBits1);
		}

		// ... and skip a bit in the timing pattern ...
		$formatInfoBits1 = $this->copyVersionBit(7, 8, $formatInfoBits1);
		$formatInfoBits1 = $this->copyVersionBit(8, 8, $formatInfoBits1);
		$formatInfoBits1 = $this->copyVersionBit(8, 7, $formatInfoBits1);
		// ... and skip a bit in the timing pattern ...
		for($j = 5; $j >= 0; $j--){
			$formatInfoBits1 = $this->copyVersionBit(8, $j, $formatInfoBits1);
		}

		// Read the top-right/bottom-left pattern too
		$formatInfoBits2 = 0;
		$jMin            = ($this->moduleCount - 7);

		for($j = ($this->moduleCount - 1); $j >= $jMin; $j--){
			$formatInfoBits2 = $this->copyVersionBit(8, $j, $formatInfoBits2);
		}

		for($i = ($this->moduleCount - 8); $i < $this->moduleCount; $i++){
			$formatInfoBits2 = $this->copyVersionBit($i, 8, $formatInfoBits2);
		}

		$formatInfo = $this->doDecodeFormatInformation($formatInfoBits1, $formatInfoBits2);

		if($formatInfo === null){

			// Should return null, but, some QR codes apparently do not mask this info.
			// Try again by actually masking the pattern first.
			$formatInfo = $this->doDecodeFormatInformation(
				($formatInfoBits1 ^ $this::FORMAT_INFO_MASK_QR),
				($formatInfoBits2 ^ $this::FORMAT_INFO_MASK_QR)
			);

			// still nothing???
			if($formatInfo === null){
				throw new QRCodeDecoderException('failed to read format info'); // @codeCoverageIgnore
			}

		}

		$this->eccLevel    = new EccLevel(($formatInfo >> 3) & 0x03); // Bits 3,4
		$this->maskPattern = new MaskPattern($formatInfo & 0x07); // Bottom 3 bits

		return $this;
	}

	/**
	 *
	 */
	private function copyVersionBit(int $i, int $j, int $versionBits):int{

		$bit = $this->mirror
			? $this->check($j, $i)
			: $this->check($i, $j);

		return ($bit) ? (($versionBits << 1) | 0x1) : ($versionBits << 1);
	}

	/**
	 * Returns information about the format it specifies, or null if it doesn't seem to match any known pattern
	 */
	private function doDecodeFormatInformation(int $maskedFormatInfo1, int $maskedFormatInfo2):?int{
		$bestDifference = PHP_INT_MAX;
		$bestFormatInfo = 0;

		// Find the int in FORMAT_INFO_DECODE_LOOKUP with the fewest bits differing
		foreach($this::DECODE_LOOKUP as $maskedBits => $dataBits){

			if($maskedFormatInfo1 === $dataBits || $maskedFormatInfo2 === $dataBits){
				// Found an exact match
				return $maskedBits;
			}

			$bitsDifference = $this->numBitsDiffering($maskedFormatInfo1, $dataBits);

			if($bitsDifference < $bestDifference){
				$bestFormatInfo = $maskedBits;
				$bestDifference = $bitsDifference;
			}

			if($maskedFormatInfo1 !== $maskedFormatInfo2){
				// also try the other option
				$bitsDifference = $this->numBitsDiffering($maskedFormatInfo2, $dataBits);

				if($bitsDifference < $bestDifference){
					$bestFormatInfo = $maskedBits;
					$bestDifference = $bitsDifference;
				}
			}
		}
		// Hamming distance of the 32 masked codes is 7, by construction, so <= 3 bits differing means we found a match
		if($bestDifference <= 3){
			return $bestFormatInfo;
		}

		return null;
	}

	/**
	 * Reads version information from one of its two locations within the QR Code.
	 * Throws if both version information locations cannot be parsed as the valid encoding of version information.
	 *
	 * @throws \chillerlan\QRCode\Decoder\QRCodeDecoderException
	 * @noinspection DuplicatedCode
	 */
	private function readVersion():self{

		if($this->version !== null){
			return $this;
		}

		$provisionalVersion = (($this->moduleCount - 17) / 4);

		// no version info if v < 7
		if($provisionalVersion < 7){
			$this->version = new Version($provisionalVersion);

			return $this;
		}

		// Read top-right version info: 3 wide by 6 tall
		$versionBits = 0;
		$ijMin       = ($this->moduleCount - 11);

		for($y = 5; $y >= 0; $y--){
			for($x = ($this->moduleCount - 9); $x >= $ijMin; $x--){
				$versionBits = $this->copyVersionBit($x, $y, $versionBits);
			}
		}

		$this->version = $this->decodeVersionInformation($versionBits);

		if($this->version !== null && $this->version->getDimension() === $this->moduleCount){
			return $this;
		}

		// Hmm, failed. Try bottom left: 6 wide by 3 tall
		$versionBits = 0;

		for($x = 5; $x >= 0; $x--){
			for($y = ($this->moduleCount - 9); $y >= $ijMin; $y--){
				$versionBits = $this->copyVersionBit($x, $y, $versionBits);
			}
		}

		$this->version = $this->decodeVersionInformation($versionBits);

		if($this->version !== null && $this->version->getDimension() === $this->moduleCount){
			return $this;
		}

		throw new QRCodeDecoderException('failed to read version');
	}

	/**
	 * Decodes the version information from the given bit sequence, returns null if no valid match is found.
	 */
	private function decodeVersionInformation(int $versionBits):?Version{
		$bestDifference = PHP_INT_MAX;
		$bestVersion    = 0;

		for($i = 7; $i <= 40; $i++){
			$targetVersion        = new Version($i);
			$targetVersionPattern = $targetVersion->getVersionPattern();

			// Do the version info bits match exactly? done.
			if($targetVersionPattern === $versionBits){
				return $targetVersion;
			}

			// Otherwise see if this is the closest to a real version info bit string
			// we have seen so far
			/** @phan-suppress-next-line PhanTypeMismatchArgumentNullable ($targetVersionPattern is never null here) */
			$bitsDifference = $this->numBitsDiffering($versionBits, $targetVersionPattern);

			if($bitsDifference < $bestDifference){
				$bestVersion    = $i;
				$bestDifference = $bitsDifference;
			}
		}
		// We can tolerate up to 3 bits of error since no two version info codewords will
		// differ in less than 8 bits.
		if($bestDifference <= 3){
			return new Version($bestVersion);
		}

		// If we didn't find a close enough match, fail
		return null;
	}

	/**
	 *
	 */
	private function uRShift(int $a, int $b):int{

		if($b === 0){
			return $a;
		}

		return (($a >> $b) & ~((1 << (8 * PHP_INT_SIZE - 1)) >> ($b - 1)));
	}

	/**
	 *
	 */
	private function numBitsDiffering(int $a, int $b):int{
		// a now has a 1 bit exactly where its bit differs with b's
		$a ^= $b;
		// Offset $i holds the number of 1-bits in the binary representation of $i
		$BITS_SET_IN_HALF_BYTE = [0, 1, 1, 2, 1, 2, 2, 3, 1, 2, 2, 3, 2, 3, 3, 4];
		// Count bits set quickly with a series of lookups:
		$count = 0;

		for($i = 0; $i < 32; $i += 4){
			$count += $BITS_SET_IN_HALF_BYTE[($this->uRShift($a, $i) & 0x0F)];
		}

		return $count;
	}

	/**
	 * @codeCoverageIgnore
	 * @throws \chillerlan\QRCode\Data\QRCodeDataException
	 */
	public function setQuietZone(int $quietZoneSize = null):self{
		throw new QRCodeDataException('not supported');
	}

	/**
	 * @codeCoverageIgnore
	 * @throws \chillerlan\QRCode\Data\QRCodeDataException
	 */
	public function setLogoSpace(int $width, int $height = null, int $startX = null, int $startY = null):self{
		throw new QRCodeDataException('not supported');
	}

}
