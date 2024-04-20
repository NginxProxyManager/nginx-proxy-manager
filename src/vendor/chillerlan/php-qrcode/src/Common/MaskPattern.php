<?php
/**
 * Class MaskPattern
 *
 * @created      19.01.2021
 * @author       ZXing Authors
 * @author       Smiley <smiley@chillerlan.net>
 * @copyright    2021 Smiley
 * @license      Apache-2.0
 */

namespace chillerlan\QRCode\Common;

use chillerlan\QRCode\QRCodeException;
use chillerlan\QRCode\Data\QRMatrix;
use Closure;
use function abs, array_column, array_search, intdiv, min;

/**
 * ISO/IEC 18004:2000 Section 8.8.1
 * ISO/IEC 18004:2000 Section 8.8.2 - Evaluation of masking results
 *
 * @see http://www.thonky.com/qr-code-tutorial/data-masking
 * @see https://github.com/zxing/zxing/blob/e9e2bd280bcaeabd59d0f955798384fe6c018a6c/core/src/main/java/com/google/zxing/qrcode/encoder/MaskUtil.java
 */
final class MaskPattern{

	/**
	 * @see \chillerlan\QRCode\QROptionsTrait::$maskPattern
	 *
	 * @var int
	 */
	public const AUTO = -1;

	public const PATTERN_000 = 0b000;
	public const PATTERN_001 = 0b001;
	public const PATTERN_010 = 0b010;
	public const PATTERN_011 = 0b011;
	public const PATTERN_100 = 0b100;
	public const PATTERN_101 = 0b101;
	public const PATTERN_110 = 0b110;
	public const PATTERN_111 = 0b111;

	/**
	 * @var int[]
	 */
	public const PATTERNS = [
		self::PATTERN_000,
		self::PATTERN_001,
		self::PATTERN_010,
		self::PATTERN_011,
		self::PATTERN_100,
		self::PATTERN_101,
		self::PATTERN_110,
		self::PATTERN_111,
	];

	/*
	 * Penalty scores
	 *
	 * ISO/IEC 18004:2000 Section 8.8.1 - Table 24
	 */
	private const PENALTY_N1 = 3;
	private const PENALTY_N2 = 3;
	private const PENALTY_N3 = 40;
	private const PENALTY_N4 = 10;

	/**
	 * The current mask pattern value (0-7)
	 */
	private int $maskPattern;

	/**
	 * MaskPattern constructor.
	 *
	 * @throws \chillerlan\QRCode\QRCodeException
	 */
	public function __construct(int $maskPattern){

		if((0b111 & $maskPattern) !== $maskPattern){
			throw new QRCodeException('invalid mask pattern');
		}

		$this->maskPattern = $maskPattern;
	}

	/**
	 * Returns the current mask pattern
	 */
	public function getPattern():int{
		return $this->maskPattern;
	}

	/**
	 * Returns a closure that applies the mask for the chosen mask pattern.
	 *
	 * Note that the diagram in section 6.8.1 is misleading since it indicates that $i is column position
	 * and $j is row position. In fact, as the text says, $i is row position and $j is column position.
	 *
	 * @see https://www.thonky.com/qr-code-tutorial/mask-patterns
	 * @see https://github.com/zxing/zxing/blob/e9e2bd280bcaeabd59d0f955798384fe6c018a6c/core/src/main/java/com/google/zxing/qrcode/decoder/DataMask.java#L32-L117
	 */
	public function getMask():Closure{
		// $x = column (width), $y = row (height)
		return [
			self::PATTERN_000 => fn(int $x, int $y):bool => (($x + $y) % 2) === 0,
			self::PATTERN_001 => fn(int $x, int $y):bool => ($y % 2) === 0,
			self::PATTERN_010 => fn(int $x, int $y):bool => ($x % 3) === 0,
			self::PATTERN_011 => fn(int $x, int $y):bool => (($x + $y) % 3) === 0,
			self::PATTERN_100 => fn(int $x, int $y):bool => ((intdiv($y, 2) + intdiv($x, 3)) % 2) === 0,
			self::PATTERN_101 => fn(int $x, int $y):bool => (($x * $y) % 6) === 0,
			self::PATTERN_110 => fn(int $x, int $y):bool => (($x * $y) % 6) < 3,
			self::PATTERN_111 => fn(int $x, int $y):bool => (($x + $y + (($x * $y) % 3)) % 2) === 0,
		][$this->maskPattern];
	}

	/**
	 * Evaluates the matrix of the given data interface and returns a new mask pattern instance for the best result
	 */
	public static function getBestPattern(QRMatrix $QRMatrix):self{
		$penalties = [];
		$size      = $QRMatrix->getSize();

		foreach(self::PATTERNS as $pattern){
			$mp      = new self($pattern);
			$matrix  = (clone $QRMatrix)->setFormatInfo($mp)->mask($mp)->getMatrix(true);
			$penalty = 0;

			for($level = 1; $level <= 4; $level++){
				$penalty += self::{'testRule'.$level}($matrix, $size, $size);
			}

			$penalties[$pattern] = (int)$penalty;
		}

		return new self(array_search(min($penalties), $penalties, true));
	}

	/**
	 * Apply mask penalty rule 1 and return the penalty. Find repetitive cells with the same color and
	 * give penalty to them. Example: 00000 or 11111.
	 */
	public static function testRule1(array $matrix, int $height, int $width):int{
		$penalty = 0;

		// horizontal
		foreach($matrix as $row){
			$penalty += self::applyRule1($row);
		}

		// vertical
		for($x = 0; $x < $width; $x++){
			$penalty += self::applyRule1(array_column($matrix, $x));
		}

		return $penalty;
	}

	/**
	 *
	 */
	private static function applyRule1(array $rc):int{
		$penalty         = 0;
		$numSameBitCells = 0;
		$prevBit         = null;

		foreach($rc as $val){

			if($val === $prevBit){
				$numSameBitCells++;
			}
			else{

				if($numSameBitCells >= 5){
					$penalty += (self::PENALTY_N1 + $numSameBitCells - 5);
				}

				$numSameBitCells = 1;  // Include the cell itself.
				$prevBit         = $val;
			}
		}

		if($numSameBitCells >= 5){
			$penalty += (self::PENALTY_N1 + $numSameBitCells - 5);
		}

		return $penalty;
	}

	/**
	 * Apply mask penalty rule 2 and return the penalty. Find 2x2 blocks with the same color and give
	 * penalty to them. This is actually equivalent to the spec's rule, which is to find MxN blocks and give a
	 * penalty proportional to (M-1)x(N-1), because this is the number of 2x2 blocks inside such a block.
	 */
	public static function testRule2(array $matrix, int $height, int $width):int{
		$penalty = 0;

		foreach($matrix as $y => $row){

			if($y > ($height - 2)){
				break;
			}

			foreach($row as $x => $val){

				if($x > ($width - 2)){
					break;
				}

				if(
					   $val === $row[($x + 1)]
					&& $val === $matrix[($y + 1)][$x]
					&& $val === $matrix[($y + 1)][($x + 1)]
				){
					$penalty++;
				}
			}
		}

		return (self::PENALTY_N2 * $penalty);
	}

	/**
	 * Apply mask penalty rule 3 and return the penalty. Find consecutive runs of 1:1:3:1:1:4
	 * starting with black, or 4:1:1:3:1:1 starting with white, and give penalty to them.  If we
	 * find patterns like 000010111010000, we give penalty once.
	 */
	public static function testRule3(array $matrix, int $height, int $width):int{
		$penalties = 0;

		foreach($matrix as $y => $row){
			foreach($row as $x => $val){

				if(
					($x + 6) < $width
					&&  $val
					&& !$row[($x + 1)]
					&&  $row[($x + 2)]
					&&  $row[($x + 3)]
					&&  $row[($x + 4)]
					&& !$row[($x + 5)]
					&&  $row[($x + 6)]
					&& (
						   self::isWhiteHorizontal($row, $width, ($x - 4), $x)
						|| self::isWhiteHorizontal($row, $width, ($x + 7), ($x + 11))
					)
				){
					$penalties++;
				}

				if(
					($y + 6) < $height
					&&  $val
					&& !$matrix[($y + 1)][$x]
					&&  $matrix[($y + 2)][$x]
					&&  $matrix[($y + 3)][$x]
					&&  $matrix[($y + 4)][$x]
					&& !$matrix[($y + 5)][$x]
					&&  $matrix[($y + 6)][$x]
					&& (
						   self::isWhiteVertical($matrix, $height, $x, ($y - 4), $y)
						|| self::isWhiteVertical($matrix, $height, $x, ($y + 7), ($y + 11))
					)
				){
					$penalties++;
				}

			}
		}

		return ($penalties * self::PENALTY_N3);
	}

	/**
	 *
	 */
	private static function isWhiteHorizontal(array $row, int $width, int $from, int $to):bool{

		if($from < 0 || $width < $to){
			return false;
		}

		for($x = $from; $x < $to; $x++){
			if($row[$x]){
				return false;
			}
		}

		return true;
	}

	/**
	 *
	 */
	private static function isWhiteVertical(array $matrix, int $height, int $x, int $from, int $to):bool{

		if($from < 0 || $height < $to){
			return false;
		}

		for($y = $from; $y < $to; $y++){
			if($matrix[$y][$x] === true){
				return false;
			}
		}

		return true;
	}

	/**
	 * Apply mask penalty rule 4 and return the penalty. Calculate the ratio of dark cells and give
	 * penalty if the ratio is far from 50%. It gives 10 penalty for 5% distance.
	 */
	public static function testRule4(array $matrix, int $height, int $width):int{
		$darkCells  = 0;
		$totalCells = ($height * $width);

		foreach($matrix as $row){
			foreach($row as $val){
				if($val === true){
					$darkCells++;
				}
			}
		}

		return (intdiv((abs($darkCells * 2 - $totalCells) * 10), $totalCells) * self::PENALTY_N4);
	}

}
