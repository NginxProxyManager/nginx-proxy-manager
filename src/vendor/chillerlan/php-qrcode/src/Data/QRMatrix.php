<?php
/**
 * Class QRMatrix
 *
 * @created      15.11.2017
 * @author       Smiley <smiley@chillerlan.net>
 * @copyright    2017 Smiley
 * @license      MIT
 */

namespace chillerlan\QRCode\Data;

use chillerlan\QRCode\Common\{BitBuffer, EccLevel, MaskPattern, Version};
use function array_fill, array_map, array_reverse, count, intdiv;

/**
 * Holds an array representation of the final QR Code that contains numerical values for later output modifications;
 * maps the ECC coded binary data and applies the mask pattern
 *
 * @see http://www.thonky.com/qr-code-tutorial/format-version-information
 */
class QRMatrix{

	/*
	 * special values
	 */

	/** @var int */
	public const IS_DARK            = 0b100000000000;
	/** @var int */
	public const M_NULL             = 0b000000000000;
	/** @var int */
	public const M_LOGO             = 0b001000000000;
	/** @var int */
	public const M_LOGO_DARK        = 0b101000000000;

	/*
	 * light values
	 */

	/** @var int */
	public const M_DATA             = 0b000000000010;
	/** @var int */
	public const M_FINDER           = 0b000000000100;
	/** @var int */
	public const M_SEPARATOR        = 0b000000001000;
	/** @var int */
	public const M_ALIGNMENT        = 0b000000010000;
	/** @var int */
	public const M_TIMING           = 0b000000100000;
	/** @var int */
	public const M_FORMAT           = 0b000001000000;
	/** @var int */
	public const M_VERSION          = 0b000010000000;
	/** @var int */
	public const M_QUIETZONE        = 0b000100000000;

	/*
	 * dark values
	 */

	/** @var int */
	public const M_DARKMODULE       = 0b100000000001;
	/** @var int */
	public const M_DATA_DARK        = 0b100000000010;
	/** @var int */
	public const M_FINDER_DARK      = 0b100000000100;
	/** @var int */
	public const M_ALIGNMENT_DARK   = 0b100000010000;
	/** @var int */
	public const M_TIMING_DARK      = 0b100000100000;
	/** @var int */
	public const M_FORMAT_DARK      = 0b100001000000;
	/** @var int */
	public const M_VERSION_DARK     = 0b100010000000;
	/** @var int */
	public const M_FINDER_DOT       = 0b110000000000;

	/*
	 * values used for reversed reflectance
	 */

	/** @var int */
	public const M_DARKMODULE_LIGHT = 0b000000000001;
	/** @var int */
	public const M_FINDER_DOT_LIGHT = 0b010000000000;
	/** @var int */
	public const M_SEPARATOR_DARK   = 0b100000001000;
	/** @var int */
	public const M_QUIETZONE_DARK   = 0b100100000000;

	/**
	 * Map of flag => coord
	 *
	 * @see \chillerlan\QRCode\Data\QRMatrix::checkNeighbours()
	 *
	 * @var array
	 */
	protected const neighbours = [
		0b00000001 => [-1, -1],
		0b00000010 => [ 0, -1],
		0b00000100 => [ 1, -1],
		0b00001000 => [ 1,  0],
		0b00010000 => [ 1,  1],
		0b00100000 => [ 0,  1],
		0b01000000 => [-1,  1],
		0b10000000 => [-1,  0],
	];

	/**
	 * the matrix version - always set in QRMatrix, may be null in BitMatrix
	 */
	protected ?Version $version = null;

	/**
	 * the current ECC level - always set in QRMatrix, may be null in BitMatrix
	 */
	protected ?EccLevel $eccLevel = null;

	/**
	 * the mask pattern that was used in the most recent operation, set via:
	 *
	 * - QRMatrix::setFormatInfo()
	 * - QRMatrix::mask()
	 * - BitMatrix::readFormatInformation()
	 */
	protected ?MaskPattern $maskPattern = null;

	/**
	 * the size (side length) of the matrix, including quiet zone (if created)
	 */
	protected int $moduleCount;

	/**
	 * the actual matrix data array
	 *
	 * @var int[][]
	 */
	protected array $matrix;

	/**
	 * QRMatrix constructor.
	 */
	public function __construct(Version $version, EccLevel $eccLevel){
		$this->version     = $version;
		$this->eccLevel    = $eccLevel;
		$this->moduleCount = $this->version->getDimension();
		$this->matrix      = $this->createMatrix($this->moduleCount, $this::M_NULL);
	}

	/**
	 * Creates a 2-dimensional array (square) of the given $size
	 */
	protected function createMatrix(int $size, int $value):array{
		return array_fill(0, $size, array_fill(0, $size, $value));
	}

	/**
	 * shortcut to initialize the functional patterns
	 */
	public function initFunctionalPatterns():self{
		return $this
			->setFinderPattern()
			->setSeparators()
			->setAlignmentPattern()
			->setTimingPattern()
			->setDarkModule()
			->setVersionNumber()
			->setFormatInfo()
		;
	}

	/**
	 * Returns the data matrix, returns a pure boolean representation if $boolean is set to true
	 *
	 * @return int[][]|bool[][]
	 */
	public function getMatrix(bool $boolean = null):array{

		if($boolean !== true){
			return $this->matrix;
		}

		$matrix = $this->matrix;

		foreach($matrix as &$row){
			$row = array_map([$this, 'isDark'], $row);
		}

		return $matrix;
	}

	/**
	 * @deprecated 5.0.0 use QRMatrix::getMatrix() instead
	 * @see \chillerlan\QRCode\Data\QRMatrix::getMatrix()
	 * @codeCoverageIgnore
	 */
	public function matrix(bool $boolean = null):array{
		return $this->getMatrix($boolean);
	}

	/**
	 * Returns the current version number
	 */
	public function getVersion():?Version{
		return $this->version;
	}

	/**
	 * @deprecated 5.0.0 use QRMatrix::getVersion() instead
	 * @see \chillerlan\QRCode\Data\QRMatrix::getVersion()
	 * @codeCoverageIgnore
	 */
	public function version():?Version{
		return $this->getVersion();
	}

	/**
	 * Returns the current ECC level
	 */
	public function getEccLevel():?EccLevel{
		return $this->eccLevel;
	}

	/**
	 * @deprecated 5.0.0 use QRMatrix::getEccLevel() instead
	 * @see \chillerlan\QRCode\Data\QRMatrix::getEccLevel()
	 * @codeCoverageIgnore
	 */
	public function eccLevel():?EccLevel{
		return $this->getEccLevel();
	}

	/**
	 * Returns the current mask pattern
	 */
	public function getMaskPattern():?MaskPattern{
		return $this->maskPattern;
	}

	/**
	 * @deprecated 5.0.0 use QRMatrix::getMaskPattern() instead
	 * @see \chillerlan\QRCode\Data\QRMatrix::getMaskPattern()
	 * @codeCoverageIgnore
	 */
	public function maskPattern():?MaskPattern{
		return $this->getMaskPattern();
	}

	/**
	 * Returns the absoulute size of the matrix, including quiet zone (after setting it).
	 *
	 * size = version * 4 + 17 [ + 2 * quietzone size]
	 */
	public function getSize():int{
		return $this->moduleCount;
	}

	/**
	 * @deprecated 5.0.0 use QRMatrix::getSize() instead
	 * @see \chillerlan\QRCode\Data\QRMatrix::getSize()
	 * @codeCoverageIgnore
	 */
	public function size():int{
		return $this->getSize();
	}

	/**
	 * Returns the value of the module at position [$x, $y] or -1 if the coordinate is outside the matrix
	 */
	public function get(int $x, int $y):int{

		if(!isset($this->matrix[$y][$x])){
			return -1;
		}

		return $this->matrix[$y][$x];
	}

	/**
	 * Sets the $M_TYPE value for the module at position [$x, $y]
	 *
	 *   true  => $M_TYPE | 0x800
	 *   false => $M_TYPE
	 */
	public function set(int $x, int $y, bool $value, int $M_TYPE):self{

		if(isset($this->matrix[$y][$x])){
			// we don't know whether the input is dark, so we remove the dark bit
			$M_TYPE &= ~$this::IS_DARK;

			if($value === true){
				$M_TYPE |= $this::IS_DARK;
			}

			$this->matrix[$y][$x] = $M_TYPE;
		}

		return $this;
	}

	/**
	 * Fills an area of $width * $height, from the given starting point [$startX, $startY] (top left) with $value for $M_TYPE.
	 */
	public function setArea(int $startX, int $startY, int $width, int $height, bool $value, int $M_TYPE):self{

		for($y = $startY; $y < ($startY + $height); $y++){
			for($x = $startX; $x < ($startX + $width); $x++){
				$this->set($x, $y, $value, $M_TYPE);
			}
		}

		return $this;
	}

	/**
	 * Flips the value of the module at ($x, $y)
	 */
	public function flip(int $x, int $y):self{

		if(isset($this->matrix[$y][$x])){
			$this->matrix[$y][$x] ^= $this::IS_DARK;
		}

		return $this;
	}

	/**
	 * Checks whether the module at ($x, $y) is of the given $M_TYPE
	 *
	 *   true => $value & $M_TYPE === $M_TYPE
	 *
	 * Also, returns false if the given coordinates are out of range.
	 */
	public function checkType(int $x, int $y, int $M_TYPE):bool{

		if(isset($this->matrix[$y][$x])){
			return ($this->matrix[$y][$x] & $M_TYPE) === $M_TYPE;
		}

		return false;
	}

	/**
	 * Checks whether the module at ($x, $y) is in the given array of $M_TYPES,
	 * returns true if a match is found, otherwise false.
	 */
	public function checkTypeIn(int $x, int $y, array $M_TYPES):bool{

		foreach($M_TYPES as $type){
			if($this->checkType($x, $y, $type)){
				return true;
			}
		}

		return false;
	}

	/**
	 * Checks whether the module at ($x, $y) is true (dark) or false (light)
	 *
	 * Also, returns false if the given coordinates are out of range.
	 */
	public function check(int $x, int $y):bool{

		if(isset($this->matrix[$y][$x])){
			return $this->isDark($this->matrix[$y][$x]);
		}

		return false;
	}

	/**
	 * Checks whether the given $M_TYPE is a dark value
	 */
	public function isDark(int $M_TYPE):bool{
		return ($M_TYPE & $this::IS_DARK) === $this::IS_DARK;
	}

	/**
	 * Checks the status of the neighbouring modules for the module at ($x, $y) and returns a bitmask with the results.
	 *
	 * The 8 flags of the bitmask represent the status of each of the neighbouring fields,
	 * starting with the lowest bit for top left, going clockwise:
	 *
	 *   0 1 2
	 *   7 # 3
	 *   6 5 4
	 */
	public function checkNeighbours(int $x, int $y, int $M_TYPE = null):int{
		$bits = 0;

		foreach($this::neighbours as $bit => [$ix, $iy]){
			$ix += $x;
			$iy += $y;

			// $M_TYPE is given, skip if the field is not the same type
			if($M_TYPE !== null && !$this->checkType($ix, $iy, $M_TYPE)){
				continue;
			}

			if($this->checkType($ix, $iy, $this::IS_DARK)){
				$bits |= $bit;
			}
		}

		return $bits;
	}

	/**
	 * Sets the "dark module", that is always on the same position 1x1px away from the bottom left finder
	 *
	 * 4 * version + 9 or moduleCount - 8
	 */
	public function setDarkModule():self{
		$this->set(8, ($this->moduleCount - 8), true, $this::M_DARKMODULE);

		return $this;
	}

	/**
	 * Draws the 7x7 finder patterns in the corners top left/right and bottom left
	 *
	 * ISO/IEC 18004:2000 Section 7.3.2
	 */
	public function setFinderPattern():self{

		$pos = [
			[0, 0], // top left
			[($this->moduleCount - 7), 0], // top right
			[0, ($this->moduleCount - 7)], // bottom left
		];

		foreach($pos as $c){
			$this
				->setArea( $c[0]     ,  $c[1]     , 7, 7, true, $this::M_FINDER)
				->setArea(($c[0] + 1), ($c[1] + 1), 5, 5, false, $this::M_FINDER)
				->setArea(($c[0] + 2), ($c[1] + 2), 3, 3, true, $this::M_FINDER_DOT)
			;
		}

		return $this;
	}

	/**
	 * Draws the separator lines around the finder patterns
	 *
	 * ISO/IEC 18004:2000 Section 7.3.3
	 */
	public function setSeparators():self{

		$h = [
			[7, 0],
			[($this->moduleCount - 8), 0],
			[7, ($this->moduleCount - 8)],
		];

		$v = [
			[7, 7],
			[($this->moduleCount - 1), 7],
			[7, ($this->moduleCount - 8)],
		];

		for($c = 0; $c < 3; $c++){
			for($i = 0; $i < 8; $i++){
				$this->set( $h[$c][0]      , ($h[$c][1] + $i), false, $this::M_SEPARATOR);
				$this->set(($v[$c][0] - $i),  $v[$c][1]      , false, $this::M_SEPARATOR);
			}
		}

		return $this;
	}


	/**
	 * Draws the 5x5 alignment patterns
	 *
	 * ISO/IEC 18004:2000 Section 7.3.5
	 */
	public function setAlignmentPattern():self{
		$alignmentPattern = $this->version->getAlignmentPattern();

		foreach($alignmentPattern as $y){
			foreach($alignmentPattern as $x){

				// skip existing patterns
				if($this->matrix[$y][$x] !== $this::M_NULL){
					continue;
				}

				$this
					->setArea(($x - 2), ($y - 2), 5, 5, true, $this::M_ALIGNMENT)
					->setArea(($x - 1), ($y - 1), 3, 3, false, $this::M_ALIGNMENT)
					->set($x, $y, true, $this::M_ALIGNMENT)
				;

			}
		}

		return $this;
	}


	/**
	 * Draws the timing pattern (h/v checkered line between the finder patterns)
	 *
	 * ISO/IEC 18004:2000 Section 7.3.4
	 */
	public function setTimingPattern():self{

		for($i = 8; $i < ($this->moduleCount - 8); $i++){

			if($this->matrix[6][$i] !== $this::M_NULL || $this->matrix[$i][6] !== $this::M_NULL){
				continue;
			}

			$v = ($i % 2) === 0;

			$this->set($i, 6, $v, $this::M_TIMING); // h
			$this->set(6, $i, $v, $this::M_TIMING); // v
		}

		return $this;
	}

	/**
	 * Draws the version information, 2x 3x6 pixel
	 *
	 * ISO/IEC 18004:2000 Section 8.10
	 */
	public function setVersionNumber():self{
		$bits = $this->version->getVersionPattern();

		if($bits !== null){

			for($i = 0; $i < 18; $i++){
				$a = intdiv($i, 3);
				$b = (($i % 3) + ($this->moduleCount - 8 - 3));
				$v = (($bits >> $i) & 1) === 1;

				$this->set($b, $a, $v, $this::M_VERSION); // ne
				$this->set($a, $b, $v, $this::M_VERSION); // sw
			}

		}

		return $this;
	}

	/**
	 * Draws the format info along the finder patterns. If no $maskPattern, all format info modules will be set to false.
	 *
	 * ISO/IEC 18004:2000 Section 8.9
	 */
	public function setFormatInfo(MaskPattern $maskPattern = null):self{
		$this->maskPattern = $maskPattern;
		$bits              = 0; // sets all format fields to false (test mode)

		if($this->maskPattern instanceof MaskPattern){
			$bits = $this->eccLevel->getformatPattern($this->maskPattern);
		}

		for($i = 0; $i < 15; $i++){
			$v = (($bits >> $i) & 1) === 1;

			if($i < 6){
				$this->set(8, $i, $v, $this::M_FORMAT);
			}
			elseif($i < 8){
				$this->set(8, ($i + 1), $v, $this::M_FORMAT);
			}
			else{
				$this->set(8, ($this->moduleCount - 15 + $i), $v, $this::M_FORMAT);
			}

			if($i < 8){
				$this->set(($this->moduleCount - $i - 1), 8, $v, $this::M_FORMAT);
			}
			elseif($i < 9){
				$this->set(((15 - $i)), 8, $v, $this::M_FORMAT);
			}
			else{
				$this->set((15 - $i - 1), 8, $v, $this::M_FORMAT);
			}

		}

		return $this;
	}

	/**
	 * Draws the "quiet zone" of $size around the matrix
	 *
	 * ISO/IEC 18004:2000 Section 7.3.7
	 *
	 * @throws \chillerlan\QRCode\Data\QRCodeDataException
	 */
	public function setQuietZone(int $quietZoneSize):self{

		// early exit if there's nothing to add
		if($quietZoneSize < 1){
			return $this;
		}

		if($this->matrix[($this->moduleCount - 1)][($this->moduleCount - 1)] === $this::M_NULL){
			throw new QRCodeDataException('use only after writing data');
		}

		// create a matrix with the new size
		$newSize   = ($this->moduleCount + ($quietZoneSize * 2));
		$newMatrix = $this->createMatrix($newSize, $this::M_QUIETZONE);

		// copy over the current matrix
		foreach($this->matrix as $y => $row){
			foreach($row as $x => $val){
				$newMatrix[($y + $quietZoneSize)][($x + $quietZoneSize)] = $val;
			}
		}

		// set the new values
		$this->moduleCount = $newSize;
		$this->matrix      = $newMatrix;

		return $this;
	}

	/**
	 * Rotates the matrix by 90 degrees clock wise
	 */
	public function rotate90():self{
		/** @phan-suppress-next-line PhanParamTooFewInternalUnpack */
		$this->matrix = array_map((fn(int ...$a):array => array_reverse($a)), ...$this->matrix);

		return $this;
	}

	/**
	 * Inverts the values of the whole matrix
	 *
	 * ISO/IEC 18004:2015 Section 6.2 - Reflectance reversal
	 */
	public function invert():self{

		foreach($this->matrix as $y => $row){
			foreach($row as $x => $val){

				// skip null fields
				if($val === $this::M_NULL){
					continue;
				}

				$this->flip($x, $y);
			}
		}

		return $this;
	}

	/**
	 * Clears a space of $width * $height in order to add a logo or text.
	 * If no $height is given, the space will be assumed a square of $width.
	 *
	 * Additionally, the logo space can be positioned within the QR Code using $startX and $startY.
	 * If either of these are null, the logo space will be centered in that direction.
	 * ECC level "H" (30%) is required.
	 *
	 * The coordinates of $startX and $startY do not include the quiet zone:
	 * [0, 0] is always the top left module of the top left finder pattern, negative values go into the quiet zone top and left.
	 *
	 * Please note that adding a logo space minimizes the error correction capacity of the QR Code and
	 * created images may become unreadable, especially when printed with a chance to receive damage.
	 * Please test thoroughly before using this feature in production.
	 *
	 * This method should be called from within an output module (after the matrix has been filled with data).
	 * Note that there is no restiction on how many times this method could be called on the same matrix instance.
	 *
	 * @link https://github.com/chillerlan/php-qrcode/issues/52
	 *
	 * @throws \chillerlan\QRCode\Data\QRCodeDataException
	 */
	public function setLogoSpace(int $width, int $height = null, int $startX = null, int $startY = null):self{
		$height ??= $width;

		// if width and height happen to be negative or 0 (default value), just return - nothing to do
		if($width <= 0 || $height <= 0){
			return $this; // @codeCoverageIgnore
		}

		// for logos, we operate in ECC H (30%) only
		if($this->eccLevel->getLevel() !== EccLevel::H){
			throw new QRCodeDataException('ECC level "H" required to add logo space');
		}

		// $this->moduleCount includes the quiet zone (if created), we need the QR size here
		$dimension = $this->version->getDimension();

		// throw if the size exceeds the qrcode size
		if($width > $dimension || $height > $dimension){
			throw new QRCodeDataException('logo dimensions exceed matrix size');
		}

		// we need uneven sizes to center the logo space, adjust if needed
		if($startX === null && ($width % 2) === 0){
			$width++;
		}

		if($startY === null && ($height % 2) === 0){
			$height++;
		}

		// throw if the logo space exceeds the maximum error correction capacity
		if(($width * $height) > (int)($dimension * $dimension * 0.25)){
			throw new QRCodeDataException('logo space exceeds the maximum error correction capacity');
		}

		$quietzone = (($this->moduleCount - $dimension) / 2);
		$end       = ($this->moduleCount - $quietzone);

		// determine start coordinates
		$startX ??= (($dimension - $width) / 2);
		$startY ??= (($dimension - $height) / 2);
		$endX     = ($quietzone + $startX + $width);
		$endY     = ($quietzone + $startY + $height);

		// clear the space
		for($y = ($quietzone + $startY); $y < $endY; $y++){
			for($x = ($quietzone + $startX); $x < $endX; $x++){
				// out of bounds, skip
				if($x < $quietzone || $y < $quietzone ||$x >= $end || $y >= $end){
					continue;
				}

				$this->set($x, $y, false, $this::M_LOGO);
			}
		}

		return $this;
	}

	/**
	 * Maps the interleaved binary $data on the matrix
	 */
	public function writeCodewords(BitBuffer $bitBuffer):self{
		$data      = (new ReedSolomonEncoder($this->version, $this->eccLevel))->interleaveEcBytes($bitBuffer);
		$byteCount = count($data);
		$iByte     = 0;
		$iBit      = 7;
		$direction = true;

		for($i = ($this->moduleCount - 1); $i > 0; $i -= 2){

			// skip vertical alignment pattern
			if($i === 6){
				$i--;
			}

			for($count = 0; $count < $this->moduleCount; $count++){
				$y = $count;

				if($direction){
					$y = ($this->moduleCount - 1 - $count);
				}

				for($col = 0; $col < 2; $col++){
					$x = ($i - $col);

					// skip functional patterns
					if($this->matrix[$y][$x] !== $this::M_NULL){
						continue;
					}

					$this->matrix[$y][$x] = $this::M_DATA;

					if($iByte < $byteCount && (($data[$iByte] >> $iBit--) & 1) === 1){
						$this->matrix[$y][$x] |= $this::IS_DARK;
					}

					if($iBit === -1){
						$iByte++;
						$iBit = 7;
					}
				}
			}

			$direction = !$direction; // switch directions
		}

		return $this;
	}

	/**
	 * Applies/reverses the mask pattern
	 *
	 * ISO/IEC 18004:2000 Section 8.8.1
	 */
	public function mask(MaskPattern $maskPattern):self{
		$this->maskPattern = $maskPattern;
		$mask              = $this->maskPattern->getMask();

		foreach($this->matrix as $y => $row){
			foreach($row as $x => $val){
				// skip non-data modules
				if(($val & $this::M_DATA) === $this::M_DATA && $mask($x, $y)){
					$this->flip($x, $y);
				}
			}
		}

		return $this;
	}

}
