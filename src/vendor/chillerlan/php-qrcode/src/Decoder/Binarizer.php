<?php
/**
 * Class Binarizer
 *
 * @created      17.01.2021
 * @author       ZXing Authors
 * @author       Smiley <smiley@chillerlan.net>
 * @copyright    2021 Smiley
 * @license      Apache-2.0
 */

namespace chillerlan\QRCode\Decoder;

use chillerlan\QRCode\Common\LuminanceSourceInterface;
use chillerlan\QRCode\Data\QRMatrix;
use function array_fill, count, intdiv, max;

/**
 * This class implements a local thresholding algorithm, which while slower than the
 * GlobalHistogramBinarizer, is fairly efficient for what it does. It is designed for
 * high frequency images of barcodes with black data on white backgrounds. For this application,
 * it does a much better job than a global blackpoint with severe shadows and gradients.
 * However, it tends to produce artifacts on lower frequency images and is therefore not
 * a good general purpose binarizer for uses outside ZXing.
 *
 * This class extends GlobalHistogramBinarizer, using the older histogram approach for 1D readers,
 * and the newer local approach for 2D readers. 1D decoding using a per-row histogram is already
 * inherently local, and only fails for horizontal gradients. We can revisit that problem later,
 * but for now it was not a win to use local blocks for 1D.
 *
 * This Binarizer is the default for the unit tests and the recommended class for library users.
 *
 * @author dswitkin@google.com (Daniel Switkin)
 */
final class Binarizer{

	// This class uses 5x5 blocks to compute local luminance, where each block is 8x8 pixels.
	// So this is the smallest dimension in each axis we can accept.
	private const BLOCK_SIZE_POWER  = 3;
	private const BLOCK_SIZE        = 8;  // ...0100...00
	private const BLOCK_SIZE_MASK   = 7;  // ...0011...11
	private const MINIMUM_DIMENSION = 40;
	private const MIN_DYNAMIC_RANGE = 24;

#	private const LUMINANCE_BITS    = 5;
	private const LUMINANCE_SHIFT   = 3;
	private const LUMINANCE_BUCKETS = 32;

	private LuminanceSourceInterface $source;
	private array                    $luminances;

	/**
	 *
	 */
	public function __construct(LuminanceSourceInterface $source){
		$this->source     = $source;
		$this->luminances = $this->source->getLuminances();
	}

	/**
	 * @throws \chillerlan\QRCode\Decoder\QRCodeDecoderException
	 */
	private function estimateBlackPoint(array $buckets):int{
		// Find the tallest peak in the histogram.
		$numBuckets     = count($buckets);
		$maxBucketCount = 0;
		$firstPeak      = 0;
		$firstPeakSize  = 0;

		for($x = 0; $x < $numBuckets; $x++){

			if($buckets[$x] > $firstPeakSize){
				$firstPeak     = $x;
				$firstPeakSize = $buckets[$x];
			}

			if($buckets[$x] > $maxBucketCount){
				$maxBucketCount = $buckets[$x];
			}
		}

		// Find the second-tallest peak which is somewhat far from the tallest peak.
		$secondPeak      = 0;
		$secondPeakScore = 0;

		for($x = 0; $x < $numBuckets; $x++){
			$distanceToBiggest = ($x - $firstPeak);
			// Encourage more distant second peaks by multiplying by square of distance.
			$score = ($buckets[$x] * $distanceToBiggest * $distanceToBiggest);

			if($score > $secondPeakScore){
				$secondPeak      = $x;
				$secondPeakScore = $score;
			}
		}

		// Make sure firstPeak corresponds to the black peak.
		if($firstPeak > $secondPeak){
			$temp       = $firstPeak;
			$firstPeak  = $secondPeak;
			$secondPeak = $temp;
		}

		// If there is too little contrast in the image to pick a meaningful black point, throw rather
		// than waste time trying to decode the image, and risk false positives.
		if(($secondPeak - $firstPeak) <= ($numBuckets / 16)){
			throw new QRCodeDecoderException('no meaningful dark point found'); // @codeCoverageIgnore
		}

		// Find a valley between them that is low and closer to the white peak.
		$bestValley      = ($secondPeak - 1);
		$bestValleyScore = -1;

		for($x = ($secondPeak - 1); $x > $firstPeak; $x--){
			$fromFirst = ($x - $firstPeak);
			$score     = ($fromFirst * $fromFirst * ($secondPeak - $x) * ($maxBucketCount - $buckets[$x]));

			if($score > $bestValleyScore){
				$bestValley      = $x;
				$bestValleyScore = $score;
			}
		}

		return ($bestValley << self::LUMINANCE_SHIFT);
	}

	/**
	 * Calculates the final BitMatrix once for all requests. This could be called once from the
	 * constructor instead, but there are some advantages to doing it lazily, such as making
	 * profiling easier, and not doing heavy lifting when callers don't expect it.
	 *
	 * Converts a 2D array of luminance data to 1 bit data. As above, assume this method is expensive
	 * and do not call it repeatedly. This method is intended for decoding 2D barcodes and may or
	 * may not apply sharpening. Therefore, a row from this matrix may not be identical to one
	 * fetched using getBlackRow(), so don't mix and match between them.
	 *
	 * @return \chillerlan\QRCode\Decoder\BitMatrix The 2D array of bits for the image (true means black).
	 */
	public function getBlackMatrix():BitMatrix{
		$width  = $this->source->getWidth();
		$height = $this->source->getHeight();

		if($width >= self::MINIMUM_DIMENSION && $height >= self::MINIMUM_DIMENSION){
			$subWidth = ($width >> self::BLOCK_SIZE_POWER);

			if(($width & self::BLOCK_SIZE_MASK) !== 0){
				$subWidth++;
			}

			$subHeight = ($height >> self::BLOCK_SIZE_POWER);

			if(($height & self::BLOCK_SIZE_MASK) !== 0){
				$subHeight++;
			}

			return $this->calculateThresholdForBlock($subWidth, $subHeight, $width, $height);
		}

		// If the image is too small, fall back to the global histogram approach.
		return $this->getHistogramBlackMatrix($width, $height);
	}

	/**
	 *
	 */
	private function getHistogramBlackMatrix(int $width, int $height):BitMatrix{

		// Quickly calculates the histogram by sampling four rows from the image. This proved to be
		// more robust on the blackbox tests than sampling a diagonal as we used to do.
		$buckets = array_fill(0, self::LUMINANCE_BUCKETS, 0);
		$right   = intdiv(($width * 4), 5);
		$x       = intdiv($width, 5);

		for($y = 1; $y < 5; $y++){
			$row             = intdiv(($height * $y), 5);
			$localLuminances = $this->source->getRow($row);

			for(; $x < $right; $x++){
				$pixel = ($localLuminances[$x] & 0xff);
				$buckets[($pixel >> self::LUMINANCE_SHIFT)]++;
			}
		}

		$blackPoint = $this->estimateBlackPoint($buckets);

		// We delay reading the entire image luminance until the black point estimation succeeds.
		// Although we end up reading four rows twice, it is consistent with our motto of
		// "fail quickly" which is necessary for continuous scanning.
		$matrix = new BitMatrix(max($width, $height));

		for($y = 0; $y < $height; $y++){
			$offset = ($y * $width);

			for($x = 0; $x < $width; $x++){
				$matrix->set($x, $y, (($this->luminances[($offset + $x)] & 0xff) < $blackPoint), QRMatrix::M_DATA);
			}
		}

		return $matrix;
	}

	/**
	 * Calculates a single black point for each block of pixels and saves it away.
	 * See the following thread for a discussion of this algorithm:
	 *
	 * @see http://groups.google.com/group/zxing/browse_thread/thread/d06efa2c35a7ddc0
	 */
	private function calculateBlackPoints(int $subWidth, int $subHeight, int $width, int $height):array{
		$blackPoints = array_fill(0, $subHeight, array_fill(0, $subWidth, 0));

		for($y = 0; $y < $subHeight; $y++){
			$yoffset    = ($y << self::BLOCK_SIZE_POWER);
			$maxYOffset = ($height - self::BLOCK_SIZE);

			if($yoffset > $maxYOffset){
				$yoffset = $maxYOffset;
			}

			for($x = 0; $x < $subWidth; $x++){
				$xoffset    = ($x << self::BLOCK_SIZE_POWER);
				$maxXOffset = ($width - self::BLOCK_SIZE);

				if($xoffset > $maxXOffset){
					$xoffset = $maxXOffset;
				}

				$sum = 0;
				$min = 255;
				$max = 0;

				for($yy = 0, $offset = ($yoffset * $width + $xoffset); $yy < self::BLOCK_SIZE; $yy++, $offset += $width){

					for($xx = 0; $xx < self::BLOCK_SIZE; $xx++){
						$pixel = ((int)($this->luminances[(int)($offset + $xx)]) & 0xff);
						$sum   += $pixel;
						// still looking for good contrast
						if($pixel < $min){
							$min = $pixel;
						}

						if($pixel > $max){
							$max = $pixel;
						}
					}

					// short-circuit min/max tests once dynamic range is met
					if(($max - $min) > self::MIN_DYNAMIC_RANGE){
						// finish the rest of the rows quickly
						for($yy++, $offset += $width; $yy < self::BLOCK_SIZE; $yy++, $offset += $width){
							for($xx = 0; $xx < self::BLOCK_SIZE; $xx++){
								$sum += ((int)($this->luminances[(int)($offset + $xx)]) & 0xff);
							}
						}
					}
				}

				// The default estimate is the average of the values in the block.
				$average = ($sum >> (self::BLOCK_SIZE_POWER * 2));

				if(($max - $min) <= self::MIN_DYNAMIC_RANGE){
					// If variation within the block is low, assume this is a block with only light or only
					// dark pixels. In that case we do not want to use the average, as it would divide this
					// low contrast area into black and white pixels, essentially creating data out of noise.
					//
					// The default assumption is that the block is light/background. Since no estimate for
					// the level of dark pixels exists locally, use half the min for the block.
					$average = ($min / 2);

					if($y > 0 && $x > 0){
						// Correct the "white background" assumption for blocks that have neighbors by comparing
						// the pixels in this block to the previously calculated black points. This is based on
						// the fact that dark barcode symbology is always surrounded by some amount of light
						// background for which reasonable black point estimates were made. The bp estimated at
						// the boundaries is used for the interior.

						// The (min < bp) is arbitrary but works better than other heuristics that were tried.
						$averageNeighborBlackPoint = (
							($blackPoints[($y - 1)][$x] + (2 * $blackPoints[$y][($x - 1)]) + $blackPoints[($y - 1)][($x - 1)]) / 4
						);

						if($min < $averageNeighborBlackPoint){
							$average = $averageNeighborBlackPoint;
						}
					}
				}

				$blackPoints[$y][$x] = $average;
			}
		}

		return $blackPoints;
	}

	/**
	 * For each block in the image, calculate the average black point using a 5x5 grid
	 * of the surrounding blocks. Also handles the corner cases (fractional blocks are computed based
	 * on the last pixels in the row/column which are also used in the previous block).
	 */
	private function calculateThresholdForBlock(int $subWidth, int $subHeight, int $width, int $height):BitMatrix{
		$matrix      = new BitMatrix(max($width, $height));
		$blackPoints = $this->calculateBlackPoints($subWidth, $subHeight, $width, $height);

		for($y = 0; $y < $subHeight; $y++){
			$yoffset    = ($y << self::BLOCK_SIZE_POWER);
			$maxYOffset = ($height - self::BLOCK_SIZE);

			if($yoffset > $maxYOffset){
				$yoffset = $maxYOffset;
			}

			for($x = 0; $x < $subWidth; $x++){
				$xoffset    = ($x << self::BLOCK_SIZE_POWER);
				$maxXOffset = ($width - self::BLOCK_SIZE);

				if($xoffset > $maxXOffset){
					$xoffset = $maxXOffset;
				}

				$left = $this->cap($x, 2, ($subWidth - 3));
				$top  = $this->cap($y, 2, ($subHeight - 3));
				$sum  = 0;

				for($z = -2; $z <= 2; $z++){
					$br   = $blackPoints[($top + $z)];
					$sum += ($br[($left - 2)] + $br[($left - 1)] + $br[$left] + $br[($left + 1)] + $br[($left + 2)]);
				}

				$average = (int)($sum / 25);

				// Applies a single threshold to a block of pixels.
				for($j = 0, $o = ($yoffset * $width + $xoffset); $j < self::BLOCK_SIZE; $j++, $o += $width){
					for($i = 0; $i < self::BLOCK_SIZE; $i++){
						// Comparison needs to be <= so that black == 0 pixels are black even if the threshold is 0.
						$v = (((int)($this->luminances[($o + $i)]) & 0xff) <= $average);

						$matrix->set(($xoffset + $i), ($yoffset + $j), $v, QRMatrix::M_DATA);
					}
				}
			}
		}

		return $matrix;
	}

	/**
	 * @noinspection PhpSameParameterValueInspection
	 */
	private function cap(int $value, int $min, int $max):int{

		if($value < $min){
			return $min;
		}

		if($value > $max){
			return $max;
		}

		return $value;
	}

}
