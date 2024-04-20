<?php
/**
 * Class BitBuffer
 *
 * @created      25.11.2015
 * @author       Smiley <smiley@chillerlan.net>
 * @copyright    2015 Smiley
 * @license      MIT
 */

namespace chillerlan\QRCode\Common;

use chillerlan\QRCode\QRCodeException;
use function count, floor, min;

/**
 * Holds the raw binary data
 */
final class BitBuffer{

	/**
	 * The buffer content
	 *
	 * @var int[]
	 */
	private array $buffer;

	/**
	 * Length of the content (bits)
	 */
	private int $length;

	/**
	 * Read count (bytes)
	 */
	private int $bytesRead = 0;

	/**
	 * Read count (bits)
	 */
	private int $bitsRead  = 0;

	/**
	 * BitBuffer constructor.
	 *
	 * @param int[] $bytes
	 */
	public function __construct(array $bytes = []){
		$this->buffer = $bytes;
		$this->length = count($this->buffer);
	}

	/**
	 * appends a sequence of bits
	 */
	public function put(int $bits, int $length):self{

		for($i = 0; $i < $length; $i++){
			$this->putBit((($bits >> ($length - $i - 1)) & 1) === 1);
		}

		return $this;
	}

	/**
	 * appends a single bit
	 */
	public function putBit(bool $bit):self{
		$bufIndex = (int)floor($this->length / 8);

		if(count($this->buffer) <= $bufIndex){
			$this->buffer[] = 0;
		}

		if($bit === true){
			$this->buffer[$bufIndex] |= (0x80 >> ($this->length % 8));
		}

		$this->length++;

		return $this;
	}

	/**
	 * returns the current buffer length
	 */
	public function getLength():int{
		return $this->length;
	}

	/**
	 * returns the buffer content
	 *
	 * to debug: array_map(fn($v) => sprintf('%08b', $v), $bitBuffer->getBuffer())
	 */
	public function getBuffer():array{
		return $this->buffer;
	}

	/**
	 * @return int number of bits that can be read successfully
	 */
	public function available():int{
		return ((8 * ($this->length - $this->bytesRead)) - $this->bitsRead);
	}

	/**
	 * @author Sean Owen, ZXing
	 *
	 * @param int $numBits number of bits to read
	 *
	 * @return int representing the bits read. The bits will appear as the least-significant bits of the int
	 * @throws \chillerlan\QRCode\QRCodeException if numBits isn't in [1,32] or more than is available
	 */
	public function read(int $numBits):int{

		if($numBits < 1 || $numBits > $this->available()){
			throw new QRCodeException('invalid $numBits: '.$numBits);
		}

		$result = 0;

		// First, read remainder from current byte
		if($this->bitsRead > 0){
			$bitsLeft       = (8 - $this->bitsRead);
			$toRead         = min($numBits, $bitsLeft);
			$bitsToNotRead  = ($bitsLeft - $toRead);
			$mask           = ((0xff >> (8 - $toRead)) << $bitsToNotRead);
			$result         = (($this->buffer[$this->bytesRead] & $mask) >> $bitsToNotRead);
			$numBits        -= $toRead;
			$this->bitsRead += $toRead;

			if($this->bitsRead === 8){
				$this->bitsRead = 0;
				$this->bytesRead++;
			}
		}

		// Next read whole bytes
		if($numBits > 0){

			while($numBits >= 8){
				$result = (($result << 8) | ($this->buffer[$this->bytesRead] & 0xff));
				$this->bytesRead++;
				$numBits -= 8;
			}

			// Finally read a partial byte
			if($numBits > 0){
				$bitsToNotRead  = (8 - $numBits);
				$mask           = ((0xff >> $bitsToNotRead) << $bitsToNotRead);
				$result         = (($result << $numBits) | (($this->buffer[$this->bytesRead] & $mask) >> $bitsToNotRead));
				$this->bitsRead += $numBits;
			}
		}

		return $result;
	}

	/**
	 * Clears the buffer and resets the stats
	 */
	public function clear():self{
		$this->buffer = [];
		$this->length = 0;

		return $this->rewind();
	}

	/**
	 * Resets the read-counters
	 */
	public function rewind():self{
		$this->bytesRead = 0;
		$this->bitsRead  = 0;

		return $this;
	}

}
