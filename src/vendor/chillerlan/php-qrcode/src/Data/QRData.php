<?php
/**
 * Class QRData
 *
 * @created      25.11.2015
 * @author       Smiley <smiley@chillerlan.net>
 * @copyright    2015 Smiley
 * @license      MIT
 */

namespace chillerlan\QRCode\Data;

use chillerlan\QRCode\Common\{BitBuffer, EccLevel, Mode, Version};
use chillerlan\Settings\SettingsContainerInterface;
use function sprintf;

/**
 * Processes the binary data and maps it on a QRMatrix which is then being returned
 */
final class QRData{

	/**
	 * the options instance
	 *
	 * @var \chillerlan\Settings\SettingsContainerInterface|\chillerlan\QRCode\QROptions
	 */
	private SettingsContainerInterface $options;

	/**
	 * a BitBuffer instance
	 */
	private BitBuffer $bitBuffer;

	/**
	 * an EccLevel instance
	 */
	private EccLevel $eccLevel;

	/**
	 * current QR Code version
	 */
	private Version $version;

	/**
	 * @var \chillerlan\QRCode\Data\QRDataModeInterface[]
	 */
	private array $dataSegments = [];

	/**
	 * Max bits for the current ECC mode
	 *
	 * @var int[]
	 */
	private array $maxBitsForEcc;

	/**
	 * QRData constructor.
	 */
	public function __construct(SettingsContainerInterface $options, array $dataSegments = []){
		$this->options       = $options;
		$this->bitBuffer     = new BitBuffer;
		$this->eccLevel      = new EccLevel($this->options->eccLevel);
		$this->maxBitsForEcc = $this->eccLevel->getMaxBits();

		$this->setData($dataSegments);
	}

	/**
	 * Sets the data string (internally called by the constructor)
	 *
	 * Subsequent calls will overwrite the current state - use the QRCode::add*Segement() method instead
	 *
	 * @param \chillerlan\QRCode\Data\QRDataModeInterface[] $dataSegments
	 */
	public function setData(array $dataSegments):self{
		$this->dataSegments = $dataSegments;
		$this->version      = $this->getMinimumVersion();

		$this->bitBuffer->clear();
		$this->writeBitBuffer();

		return $this;
	}

	/**
	 * Returns the current BitBuffer instance
	 *
	 * @codeCoverageIgnore
	 */
	public function getBitBuffer():BitBuffer{
		return $this->bitBuffer;
	}

	/**
	 * Sets a BitBuffer object
	 *
	 * This can be used instead of setData(), however, the version auto-detection is not available in this case.
	 * The version needs to match the length bits range for the data mode the data has been encoded with,
	 * additionally the bit array needs to contain enough pad bits.
	 *
	 * @throws \chillerlan\QRCode\Data\QRCodeDataException
	 */
	public function setBitBuffer(BitBuffer $bitBuffer):self{

		if($this->options->version === Version::AUTO){
			throw new QRCodeDataException('version auto detection is not available');
		}

		if($bitBuffer->getLength() === 0){
			throw new QRCodeDataException('the given BitBuffer is empty');
		}

		$this->dataSegments = [];
		$this->bitBuffer    = $bitBuffer;
		$this->version      = new Version($this->options->version);

		return $this;
	}

	/**
	 * returns a fresh matrix object with the data written and masked with the given $maskPattern
	 */
	public function writeMatrix():QRMatrix{
		return (new QRMatrix($this->version, $this->eccLevel))
			->initFunctionalPatterns()
			->writeCodewords($this->bitBuffer)
		;
	}

	/**
	 * estimates the total length of the several mode segments in order to guess the minimum version
	 *
	 * @throws \chillerlan\QRCode\Data\QRCodeDataException
	 */
	public function estimateTotalBitLength():int{
		$length = 0;

		foreach($this->dataSegments as $segment){
			// data length of the current segment
			$length += $segment->getLengthInBits();
			// +4 bits for the mode descriptor
			$length += 4;
			// Hanzi mode sets an additional 4 bit long subset identifier
			if($segment instanceof Hanzi){
				$length += 4;
			}
		}

		$provisionalVersion = null;

		foreach($this->maxBitsForEcc as $version => $maxBits){

			if($length <= $maxBits){
				$provisionalVersion = $version;
			}

		}

		if($provisionalVersion !== null){

			// add character count indicator bits for the provisional version
			foreach($this->dataSegments as $segment){
				$length += Mode::getLengthBitsForVersion($segment::DATAMODE, $provisionalVersion);
			}

			// it seems that in some cases the estimated total length is not 100% accurate,
			// so we substract 4 bits from the total when not in mixed mode
			if(count($this->dataSegments) <= 1){
				$length -= 4;
			}

			// we've got a match!
			// or let's see if there's a higher version number available
			if($length <= $this->maxBitsForEcc[$provisionalVersion] || isset($this->maxBitsForEcc[($provisionalVersion + 1)])){
				return $length;
			}

		}

		throw new QRCodeDataException(sprintf('estimated data exceeds %d bits', $length));
	}

	/**
	 * returns the minimum version number for the given string
	 *
	 * @throws \chillerlan\QRCode\Data\QRCodeDataException
	 */
	public function getMinimumVersion():Version{

		if($this->options->version !== Version::AUTO){
			return new Version($this->options->version);
		}

		$total = $this->estimateTotalBitLength();

		// guess the version number within the given range
		for($version = $this->options->versionMin; $version <= $this->options->versionMax; $version++){
			if($total <= ($this->maxBitsForEcc[$version] - 4)){
				return new Version($version);
			}
		}

		// it's almost impossible to run into this one as $this::estimateTotalBitLength() would throw first
		throw new QRCodeDataException('failed to guess minimum version'); // @codeCoverageIgnore
	}

	/**
	 * creates a BitBuffer and writes the string data to it
	 *
	 * @throws \chillerlan\QRCode\QRCodeException on data overflow
	 */
	private function writeBitBuffer():void{
		$MAX_BITS = $this->eccLevel->getMaxBitsForVersion($this->version);

		foreach($this->dataSegments as $segment){
			$segment->write($this->bitBuffer, $this->version->getVersionNumber());
		}

		// overflow, likely caused due to invalid version setting
		if($this->bitBuffer->getLength() > $MAX_BITS){
			throw new QRCodeDataException(
				sprintf('code length overflow. (%d > %d bit)', $this->bitBuffer->getLength(), $MAX_BITS)
			);
		}

		// add terminator (ISO/IEC 18004:2000 Table 2)
		if(($this->bitBuffer->getLength() + 4) <= $MAX_BITS){
			$this->bitBuffer->put(Mode::TERMINATOR, 4);
		}

		// Padding: ISO/IEC 18004:2000 8.4.9 Bit stream to codeword conversion

		// if the final codeword is not exactly 8 bits in length, it shall be made 8 bits long
		// by the addition of padding bits with binary value 0
		while(($this->bitBuffer->getLength() % 8) !== 0){

			if($this->bitBuffer->getLength() === $MAX_BITS){
				break;
			}

			$this->bitBuffer->putBit(false);
		}

		// The message bit stream shall then be extended to fill the data capacity of the symbol
		// corresponding to the Version and Error Correction Level, by the addition of the Pad
		// Codewords 11101100 and 00010001 alternately.
		$alternate = false;

		while(($this->bitBuffer->getLength() + 8) <= $MAX_BITS){
			$this->bitBuffer->put(($alternate) ? 0b00010001 : 0b11101100, 8);

			$alternate = !$alternate;
		}

		// In certain versions of symbol, it may be necessary to add 3, 4 or 7 Remainder Bits (all zeros)
		// to the end of the message in order exactly to fill the symbol capacity
		while($this->bitBuffer->getLength() <= $MAX_BITS){
			$this->bitBuffer->putBit(false);
		}

	}

}
