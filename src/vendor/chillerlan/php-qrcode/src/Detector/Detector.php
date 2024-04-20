<?php
/**
 * Class Detector
 *
 * @created      17.01.2021
 * @author       ZXing Authors
 * @author       Smiley <smiley@chillerlan.net>
 * @copyright    2021 Smiley
 * @license      Apache-2.0
 */

namespace chillerlan\QRCode\Detector;

use chillerlan\QRCode\Common\{LuminanceSourceInterface, Version};
use chillerlan\QRCode\Decoder\{Binarizer, BitMatrix};
use function abs, intdiv, is_nan, max, min, round;
use const NAN;

/**
 * Encapsulates logic that can detect a QR Code in an image, even if the QR Code
 * is rotated or skewed, or partially obscured.
 *
 * @author Sean Owen
 */
final class Detector{

	private BitMatrix $matrix;

	/**
	 * Detector constructor.
	 */
	public function __construct(LuminanceSourceInterface $source){
		$this->matrix = (new Binarizer($source))->getBlackMatrix();
	}

	/**
	 * Detects a QR Code in an image.
	 */
	public function detect():BitMatrix{
		[$bottomLeft, $topLeft, $topRight] = (new FinderPatternFinder($this->matrix))->find();

		$moduleSize         = $this->calculateModuleSize($topLeft, $topRight, $bottomLeft);
		$dimension          = $this->computeDimension($topLeft, $topRight, $bottomLeft, $moduleSize);
		$provisionalVersion = new Version(intdiv(($dimension - 17), 4));
		$alignmentPattern   = null;

		// Anything above version 1 has an alignment pattern
		if(!empty($provisionalVersion->getAlignmentPattern())){
			// Guess where a "bottom right" finder pattern would have been
			$bottomRightX = ($topRight->getX() - $topLeft->getX() + $bottomLeft->getX());
			$bottomRightY = ($topRight->getY() - $topLeft->getY() + $bottomLeft->getY());

			// Estimate that alignment pattern is closer by 3 modules
			// from "bottom right" to known top left location
			$correctionToTopLeft = (1.0 - 3.0 / (float)($provisionalVersion->getDimension() - 7));
			$estAlignmentX       = (int)($topLeft->getX() + $correctionToTopLeft * ($bottomRightX - $topLeft->getX()));
			$estAlignmentY       = (int)($topLeft->getY() + $correctionToTopLeft * ($bottomRightY - $topLeft->getY()));

			// Kind of arbitrary -- expand search radius before giving up
			for($i = 4; $i <= 16; $i <<= 1){//??????????
				$alignmentPattern = $this->findAlignmentInRegion($moduleSize, $estAlignmentX, $estAlignmentY, (float)$i);

				if($alignmentPattern !== null){
					break;
				}
			}
			// If we didn't find alignment pattern... well try anyway without it
		}

		$transform = $this->createTransform($topLeft, $topRight, $bottomLeft, $dimension, $alignmentPattern);

		return (new GridSampler)->sampleGrid($this->matrix, $dimension, $transform);
	}

	/**
	 * Computes an average estimated module size based on estimated derived from the positions
	 * of the three finder patterns.
	 *
	 * @throws \chillerlan\QRCode\Detector\QRCodeDetectorException
	 */
	private function calculateModuleSize(FinderPattern $topLeft, FinderPattern $topRight, FinderPattern $bottomLeft):float{
		// Take the average
		$moduleSize = ((
			$this->calculateModuleSizeOneWay($topLeft, $topRight) +
			$this->calculateModuleSizeOneWay($topLeft, $bottomLeft)
		) / 2.0);

		if($moduleSize < 1.0){
			throw new QRCodeDetectorException('module size < 1.0');
		}

		return $moduleSize;
	}

	/**
	 * Estimates module size based on two finder patterns -- it uses
	 * #sizeOfBlackWhiteBlackRunBothWays(int, int, int, int) to figure the
	 * width of each, measuring along the axis between their centers.
	 */
	private function calculateModuleSizeOneWay(FinderPattern $a, FinderPattern $b):float{

		$moduleSizeEst1 = $this->sizeOfBlackWhiteBlackRunBothWays($a->getX(), $a->getY(), $b->getX(), $b->getY());
		$moduleSizeEst2 = $this->sizeOfBlackWhiteBlackRunBothWays($b->getX(), $b->getY(), $a->getX(), $a->getY());

		if(is_nan($moduleSizeEst1)){
			return ($moduleSizeEst2 / 7.0);
		}

		if(is_nan($moduleSizeEst2)){
			return ($moduleSizeEst1 / 7.0);
		}
		// Average them, and divide by 7 since we've counted the width of 3 black modules,
		// and 1 white and 1 black module on either side. Ergo, divide sum by 14.
		return (($moduleSizeEst1 + $moduleSizeEst2) / 14.0);
	}

	/**
	 * See #sizeOfBlackWhiteBlackRun(int, int, int, int); computes the total width of
	 * a finder pattern by looking for a black-white-black run from the center in the direction
	 * of another po$(another finder pattern center), and in the opposite direction too.
	 *
	 * @noinspection DuplicatedCode
	 */
	private function sizeOfBlackWhiteBlackRunBothWays(float $fromX, float $fromY, float $toX, float $toY):float{
		$result    = $this->sizeOfBlackWhiteBlackRun((int)$fromX, (int)$fromY, (int)$toX, (int)$toY);
		$dimension = $this->matrix->getSize();
		// Now count other way -- don't run off image though of course
		$scale     = 1.0;
		$otherToX  = ($fromX - ($toX - $fromX));

		if($otherToX < 0){
			$scale    = ($fromX / ($fromX - $otherToX));
			$otherToX = 0;
		}
		elseif($otherToX >= $dimension){
			$scale    = (($dimension - 1 - $fromX) / ($otherToX - $fromX));
			$otherToX = ($dimension - 1);
		}

		$otherToY = (int)($fromY - ($toY - $fromY) * $scale);
		$scale    = 1.0;

		if($otherToY < 0){
			$scale    = ($fromY / ($fromY - $otherToY));
			$otherToY = 0;
		}
		elseif($otherToY >= $dimension){
			$scale    = (($dimension - 1 - $fromY) / ($otherToY - $fromY));
			$otherToY = ($dimension - 1);
		}

		$otherToX = (int)($fromX + ($otherToX - $fromX) * $scale);
		$result   += $this->sizeOfBlackWhiteBlackRun((int)$fromX, (int)$fromY, $otherToX, $otherToY);

		// Middle pixel is double-counted this way; subtract 1
		return ($result - 1.0);
	}

	/**
	 * This method traces a line from a po$in the image, in the direction towards another point.
	 * It begins in a black region, and keeps going until it finds white, then black, then white again.
	 * It reports the distance from the start to this point.
	 *
	 * This is used when figuring out how wide a finder pattern is, when the finder pattern
	 * may be skewed or rotated.
	 */
	private function sizeOfBlackWhiteBlackRun(int $fromX, int $fromY, int $toX, int $toY):float{
		// Mild variant of Bresenham's algorithm;
		// @see https://en.wikipedia.org/wiki/Bresenham%27s_line_algorithm
		$steep = abs($toY - $fromY) > abs($toX - $fromX);

		if($steep){
			$temp  = $fromX;
			$fromX = $fromY;
			$fromY = $temp;
			$temp  = $toX;
			$toX   = $toY;
			$toY   = $temp;
		}

		$dx    = abs($toX - $fromX);
		$dy    = abs($toY - $fromY);
		$error = (-$dx / 2);
		$xstep = (($fromX < $toX) ? 1 : -1);
		$ystep = (($fromY < $toY) ? 1 : -1);

		// In black pixels, looking for white, first or second time.
		$state  = 0;
		// Loop up until x == toX, but not beyond
		$xLimit = ($toX + $xstep);

		for($x = $fromX, $y = $fromY; $x !== $xLimit; $x += $xstep){
			$realX = ($steep) ? $y : $x;
			$realY = ($steep) ? $x : $y;

			// Does current pixel mean we have moved white to black or vice versa?
			// Scanning black in state 0,2 and white in state 1, so if we find the wrong
			// color, advance to next state or end if we are in state 2 already
			if(($state === 1) === $this->matrix->check($realX, $realY)){

				if($state === 2){
					return FinderPattern::distance($x, $y, $fromX, $fromY);
				}

				$state++;
			}

			$error += $dy;

			if($error > 0){

				if($y === $toY){
					break;
				}

				$y     += $ystep;
				$error -= $dx;
			}
		}

		// Found black-white-black; give the benefit of the doubt that the next pixel outside the image
		// is "white" so this last po$at (toX+xStep,toY) is the right ending. This is really a
		// small approximation; (toX+xStep,toY+yStep) might be really correct. Ignore this.
		if($state === 2){
			return FinderPattern::distance(($toX + $xstep), $toY, $fromX, $fromY);
		}

		// else we didn't find even black-white-black; no estimate is really possible
		return NAN;
	}

	/**
	 * Computes the dimension (number of modules on a size) of the QR Code based on the position
	 * of the finder patterns and estimated module size.
	 *
	 * @throws \chillerlan\QRCode\Detector\QRCodeDetectorException
	 */
	private function computeDimension(FinderPattern $nw, FinderPattern $ne, FinderPattern $sw, float $size):int{
		$tltrCentersDimension = (int)round($nw->getDistance($ne) / $size);
		$tlblCentersDimension = (int)round($nw->getDistance($sw) / $size);
		$dimension            = (int)((($tltrCentersDimension + $tlblCentersDimension) / 2) + 7);

		switch($dimension % 4){
			case 0:
				$dimension++;
				break;
			// 1? do nothing
			case 2:
				$dimension--;
				break;
			case 3:
				throw new QRCodeDetectorException('estimated dimension: '.$dimension);
		}

		if(($dimension % 4) !== 1){
			throw new QRCodeDetectorException('dimension mod 4 is not 1');
		}

		return $dimension;
	}

	/**
	 * Attempts to locate an alignment pattern in a limited region of the image, which is
	 * guessed to contain it.
	 *
	 * @param float $overallEstModuleSize estimated module size so far
	 * @param int   $estAlignmentX        x coordinate of center of area probably containing alignment pattern
	 * @param int   $estAlignmentY        y coordinate of above
	 * @param float $allowanceFactor      number of pixels in all directions to search from the center
	 *
	 * @return \chillerlan\QRCode\Detector\AlignmentPattern|null if found, or null otherwise
	 */
	private function findAlignmentInRegion(
		float $overallEstModuleSize,
		int $estAlignmentX,
		int $estAlignmentY,
		float $allowanceFactor
	):?AlignmentPattern{
		// Look for an alignment pattern (3 modules in size) around where it should be
		$dimension           = $this->matrix->getSize();
		$allowance           = (int)($allowanceFactor * $overallEstModuleSize);
		$alignmentAreaLeftX  = max(0, ($estAlignmentX - $allowance));
		$alignmentAreaRightX = min(($dimension - 1), ($estAlignmentX + $allowance));

		if(($alignmentAreaRightX - $alignmentAreaLeftX) < ($overallEstModuleSize * 3)){
			return null;
		}

		$alignmentAreaTopY    = max(0, ($estAlignmentY - $allowance));
		$alignmentAreaBottomY = min(($dimension - 1), ($estAlignmentY + $allowance));

		if(($alignmentAreaBottomY - $alignmentAreaTopY) < ($overallEstModuleSize * 3)){
			return null;
		}

		return (new AlignmentPatternFinder($this->matrix, $overallEstModuleSize))->find(
			$alignmentAreaLeftX,
			$alignmentAreaTopY,
			($alignmentAreaRightX - $alignmentAreaLeftX),
			($alignmentAreaBottomY - $alignmentAreaTopY),
		);
	}

	/**
	 *
	 */
	private function createTransform(
		FinderPattern    $nw,
		FinderPattern    $ne,
		FinderPattern    $sw,
		int              $size,
		AlignmentPattern $ap = null
	):PerspectiveTransform{
		$dimMinusThree = ($size - 3.5);

		if($ap instanceof AlignmentPattern){
			$bottomRightX       = $ap->getX();
			$bottomRightY       = $ap->getY();
			$sourceBottomRightX = ($dimMinusThree - 3.0);
			$sourceBottomRightY = $sourceBottomRightX;
		}
		else{
			// Don't have an alignment pattern, just make up the bottom-right point
			$bottomRightX       = ($ne->getX() - $nw->getX() + $sw->getX());
			$bottomRightY       = ($ne->getY() - $nw->getY() + $sw->getY());
			$sourceBottomRightX = $dimMinusThree;
			$sourceBottomRightY = $dimMinusThree;
		}

		return (new PerspectiveTransform)->quadrilateralToQuadrilateral(
			3.5,
			3.5,
			$dimMinusThree,
			3.5,
			$sourceBottomRightX,
			$sourceBottomRightY,
			3.5,
			$dimMinusThree,
			$nw->getX(),
			$nw->getY(),
			$ne->getX(),
			$ne->getY(),
			$bottomRightX,
			$bottomRightY,
			$sw->getX(),
			$sw->getY()
		);
	}

}
