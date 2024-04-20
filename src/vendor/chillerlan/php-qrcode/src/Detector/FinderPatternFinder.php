<?php
/**
 * Class FinderPatternFinder
 *
 * @created      17.01.2021
 * @author       ZXing Authors
 * @author       Smiley <smiley@chillerlan.net>
 * @copyright    2021 Smiley
 * @license      Apache-2.0
 *
 * @phan-file-suppress PhanTypePossiblyInvalidDimOffset
 */

namespace chillerlan\QRCode\Detector;

use chillerlan\QRCode\Decoder\BitMatrix;
use function abs, count, intdiv, usort;
use const PHP_FLOAT_MAX;

/**
 * This class attempts to find finder patterns in a QR Code. Finder patterns are the square
 * markers at three corners of a QR Code.
 *
 * This class is thread-safe but not reentrant. Each thread must allocate its own object.
 *
 * @author Sean Owen
 */
final class FinderPatternFinder{

	private const MIN_SKIP      = 2;
	private const MAX_MODULES   = 177; // 1 pixel/module times 3 modules/center
	private const CENTER_QUORUM = 2; // support up to version 10 for mobile clients
	private BitMatrix $matrix;
	/** @var \chillerlan\QRCode\Detector\FinderPattern[] */
	private array $possibleCenters;
	private bool  $hasSkipped = false;

	/**
	 * Creates a finder that will search the image for three finder patterns.
	 *
	 * @param BitMatrix $matrix image to search
	 */
	public function __construct(BitMatrix $matrix){
		$this->matrix          = $matrix;
		$this->possibleCenters = [];
	}

	/**
	 * @return \chillerlan\QRCode\Detector\FinderPattern[]
	 */
	public function find():array{
		$dimension = $this->matrix->getSize();

		// We are looking for black/white/black/white/black modules in
		// 1:1:3:1:1 ratio; this tracks the number of such modules seen so far
		// Let's assume that the maximum version QR Code we support takes up 1/4 the height of the
		// image, and then account for the center being 3 modules in size. This gives the smallest
		// number of pixels the center could be, so skip this often.
		$iSkip = intdiv((3 * $dimension), (4 * self::MAX_MODULES));

		if($iSkip < self::MIN_SKIP){
			$iSkip = self::MIN_SKIP;
		}

		$done = false;

		for($i = ($iSkip - 1); ($i < $dimension) && !$done; $i += $iSkip){
			// Get a row of black/white values
			$stateCount   = $this->getCrossCheckStateCount();
			$currentState = 0;

			for($j = 0; $j < $dimension; $j++){

				// Black pixel
				if($this->matrix->check($j, $i)){
					// Counting white pixels
					if(($currentState & 1) === 1){
						$currentState++;
					}

					$stateCount[$currentState]++;
				}
				// White pixel
				else{
					// Counting black pixels
					if(($currentState & 1) === 0){
						// A winner?
						if($currentState === 4){
							// Yes
							if($this->foundPatternCross($stateCount)){
								$confirmed = $this->handlePossibleCenter($stateCount, $i, $j);

								if($confirmed){
									// Start examining every other line. Checking each line turned out to be too
									// expensive and didn't improve performance.
									$iSkip = 3;

									if($this->hasSkipped){
										$done = $this->haveMultiplyConfirmedCenters();
									}
									else{
										$rowSkip = $this->findRowSkip();

										if($rowSkip > $stateCount[2]){
											// Skip rows between row of lower confirmed center
											// and top of presumed third confirmed center
											// but back up a bit to get a full chance of detecting
											// it, entire width of center of finder pattern

											// Skip by rowSkip, but back off by $stateCount[2] (size of last center
											// of pattern we saw) to be conservative, and also back off by iSkip which
											// is about to be re-added
											$i += ($rowSkip - $stateCount[2] - $iSkip);
											$j = ($dimension - 1);
										}
									}
								}
								else{
									$stateCount   = $this->doShiftCounts2($stateCount);
									$currentState = 3;

									continue;
								}
								// Clear state to start looking again
								$currentState = 0;
								$stateCount   = $this->getCrossCheckStateCount();
							}
							// No, shift counts back by two
							else{
								$stateCount   = $this->doShiftCounts2($stateCount);
								$currentState = 3;
							}
						}
						else{
							$stateCount[++$currentState]++;
						}
					}
					// Counting white pixels
					else{
						$stateCount[$currentState]++;
					}
				}
			}

			if($this->foundPatternCross($stateCount)){
				$confirmed = $this->handlePossibleCenter($stateCount, $i, $dimension);

				if($confirmed){
					$iSkip = $stateCount[0];

					if($this->hasSkipped){
						// Found a third one
						$done = $this->haveMultiplyConfirmedCenters();
					}
				}
			}
		}

		return $this->orderBestPatterns($this->selectBestPatterns());
	}

	/**
	 * @return int[]
	 */
	private function getCrossCheckStateCount():array{
		return [0, 0, 0, 0, 0];
	}

	/**
	 * @param int[] $stateCount
	 *
	 * @return int[]
	 */
	private function doShiftCounts2(array $stateCount):array{
		$stateCount[0] = $stateCount[2];
		$stateCount[1] = $stateCount[3];
		$stateCount[2] = $stateCount[4];
		$stateCount[3] = 1;
		$stateCount[4] = 0;

		return $stateCount;
	}

	/**
	 * Given a count of black/white/black/white/black pixels just seen and an end position,
	 * figures the location of the center of this run.
	 *
	 * @param int[] $stateCount
	 */
	private function centerFromEnd(array $stateCount, int $end):float{
		return (float)(($end - $stateCount[4] - $stateCount[3]) - $stateCount[2] / 2);
	}

	/**
	 * @param int[] $stateCount
	 */
	private function foundPatternCross(array $stateCount):bool{
		// Allow less than 50% variance from 1-1-3-1-1 proportions
		return $this->foundPatternVariance($stateCount, 2.0);
	}

	/**
	 * @param int[] $stateCount
	 */
	private function foundPatternDiagonal(array $stateCount):bool{
		// Allow less than 75% variance from 1-1-3-1-1 proportions
		return $this->foundPatternVariance($stateCount, 1.333);
	}

	/**
	 * @param int[] $stateCount count of black/white/black/white/black pixels just read
	 *
	 * @return bool true if the proportions of the counts is close enough to the 1/1/3/1/1 ratios
	 *              used by finder patterns to be considered a match
	 */
	private function foundPatternVariance(array $stateCount, float $variance):bool{
		$totalModuleSize = 0;

		for($i = 0; $i < 5; $i++){
			$count = $stateCount[$i];

			if($count === 0){
				return false;
			}

			$totalModuleSize += $count;
		}

		if($totalModuleSize < 7){
			return false;
		}

		$moduleSize  = ($totalModuleSize / 7.0);
		$maxVariance = ($moduleSize / $variance);

		return
			abs($moduleSize - $stateCount[0]) < $maxVariance
			&& abs($moduleSize - $stateCount[1]) < $maxVariance
			&& abs(3.0 * $moduleSize - $stateCount[2]) < (3 * $maxVariance)
			&& abs($moduleSize - $stateCount[3]) < $maxVariance
			&& abs($moduleSize - $stateCount[4]) < $maxVariance;
	}

	/**
	 * After a vertical and horizontal scan finds a potential finder pattern, this method
	 * "cross-cross-cross-checks" by scanning down diagonally through the center of the possible
	 * finder pattern to see if the same proportion is detected.
	 *
	 * @param int $centerI row where a finder pattern was detected
	 * @param int $centerJ center of the section that appears to cross a finder pattern
	 *
	 * @return bool true if proportions are withing expected limits
	 */
	private function crossCheckDiagonal(int $centerI, int $centerJ):bool{
		$stateCount = $this->getCrossCheckStateCount();

		// Start counting up, left from center finding black center mass
		$i = 0;

		while($centerI >= $i && $centerJ >= $i && $this->matrix->check(($centerJ - $i), ($centerI - $i))){
			$stateCount[2]++;
			$i++;
		}

		if($stateCount[2] === 0){
			return false;
		}

		// Continue up, left finding white space
		while($centerI >= $i && $centerJ >= $i && !$this->matrix->check(($centerJ - $i), ($centerI - $i))){
			$stateCount[1]++;
			$i++;
		}

		if($stateCount[1] === 0){
			return false;
		}

		// Continue up, left finding black border
		while($centerI >= $i && $centerJ >= $i && $this->matrix->check(($centerJ - $i), ($centerI - $i))){
			$stateCount[0]++;
			$i++;
		}

		if($stateCount[0] === 0){
			return false;
		}

		$dimension = $this->matrix->getSize();

		// Now also count down, right from center
		$i = 1;
		while(($centerI + $i) < $dimension && ($centerJ + $i) < $dimension && $this->matrix->check(($centerJ + $i), ($centerI + $i))){
			$stateCount[2]++;
			$i++;
		}

		while(($centerI + $i) < $dimension && ($centerJ + $i) < $dimension && !$this->matrix->check(($centerJ + $i), ($centerI + $i))){
			$stateCount[3]++;
			$i++;
		}

		if($stateCount[3] === 0){
			return false;
		}

		while(($centerI + $i) < $dimension && ($centerJ + $i) < $dimension && $this->matrix->check(($centerJ + $i), ($centerI + $i))){
			$stateCount[4]++;
			$i++;
		}

		if($stateCount[4] === 0){
			return false;
		}

		return $this->foundPatternDiagonal($stateCount);
	}

	/**
	 * After a horizontal scan finds a potential finder pattern, this method
	 * "cross-checks" by scanning down vertically through the center of the possible
	 * finder pattern to see if the same proportion is detected.
	 *
	 * @param int $startI   row where a finder pattern was detected
	 * @param int $centerJ  center of the section that appears to cross a finder pattern
	 * @param int $maxCount maximum reasonable number of modules that should be
	 *                      observed in any reading state, based on the results of the horizontal scan
	 * @param int $originalStateCountTotal
	 *
	 * @return float|null vertical center of finder pattern, or null if not found
	 * @noinspection DuplicatedCode
	 */
	private function crossCheckVertical(int $startI, int $centerJ, int $maxCount, int $originalStateCountTotal):?float{
		$maxI       = $this->matrix->getSize();
		$stateCount = $this->getCrossCheckStateCount();

		// Start counting up from center
		$i = $startI;
		while($i >= 0 && $this->matrix->check($centerJ, $i)){
			$stateCount[2]++;
			$i--;
		}

		if($i < 0){
			return null;
		}

		while($i >= 0 && !$this->matrix->check($centerJ, $i) && $stateCount[1] <= $maxCount){
			$stateCount[1]++;
			$i--;
		}

		// If already too many modules in this state or ran off the edge:
		if($i < 0 || $stateCount[1] > $maxCount){
			return null;
		}

		while($i >= 0 && $this->matrix->check($centerJ, $i) && $stateCount[0] <= $maxCount){
			$stateCount[0]++;
			$i--;
		}

		if($stateCount[0] > $maxCount){
			return null;
		}

		// Now also count down from center
		$i = ($startI + 1);
		while($i < $maxI && $this->matrix->check($centerJ, $i)){
			$stateCount[2]++;
			$i++;
		}

		if($i === $maxI){
			return null;
		}

		while($i < $maxI && !$this->matrix->check($centerJ, $i) && $stateCount[3] < $maxCount){
			$stateCount[3]++;
			$i++;
		}

		if($i === $maxI || $stateCount[3] >= $maxCount){
			return null;
		}

		while($i < $maxI && $this->matrix->check($centerJ, $i) && $stateCount[4] < $maxCount){
			$stateCount[4]++;
			$i++;
		}

		if($stateCount[4] >= $maxCount){
			return null;
		}

		// If we found a finder-pattern-like section, but its size is more than 40% different from
		// the original, assume it's a false positive
		$stateCountTotal = ($stateCount[0] + $stateCount[1] + $stateCount[2] + $stateCount[3] + $stateCount[4]);

		if((5 * abs($stateCountTotal - $originalStateCountTotal)) >= (2 * $originalStateCountTotal)){
			return null;
		}

		if(!$this->foundPatternCross($stateCount)){
			return null;
		}

		return $this->centerFromEnd($stateCount, $i);
	}

	/**
	 * Like #crossCheckVertical(int, int, int, int), and in fact is basically identical,
	 * except it reads horizontally instead of vertically. This is used to cross-cross
	 * check a vertical cross-check and locate the real center of the alignment pattern.
	 * @noinspection DuplicatedCode
	 */
	private function crossCheckHorizontal(int $startJ, int $centerI, int $maxCount, int $originalStateCountTotal):?float{
		$maxJ       = $this->matrix->getSize();
		$stateCount = $this->getCrossCheckStateCount();

		$j = $startJ;
		while($j >= 0 && $this->matrix->check($j, $centerI)){
			$stateCount[2]++;
			$j--;
		}

		if($j < 0){
			return null;
		}

		while($j >= 0 && !$this->matrix->check($j, $centerI) && $stateCount[1] <= $maxCount){
			$stateCount[1]++;
			$j--;
		}

		if($j < 0 || $stateCount[1] > $maxCount){
			return null;
		}

		while($j >= 0 && $this->matrix->check($j, $centerI) && $stateCount[0] <= $maxCount){
			$stateCount[0]++;
			$j--;
		}

		if($stateCount[0] > $maxCount){
			return null;
		}

		$j = ($startJ + 1);
		while($j < $maxJ && $this->matrix->check($j, $centerI)){
			$stateCount[2]++;
			$j++;
		}

		if($j === $maxJ){
			return null;
		}

		while($j < $maxJ && !$this->matrix->check($j, $centerI) && $stateCount[3] < $maxCount){
			$stateCount[3]++;
			$j++;
		}

		if($j === $maxJ || $stateCount[3] >= $maxCount){
			return null;
		}

		while($j < $maxJ && $this->matrix->check($j, $centerI) && $stateCount[4] < $maxCount){
			$stateCount[4]++;
			$j++;
		}

		if($stateCount[4] >= $maxCount){
			return null;
		}

		// If we found a finder-pattern-like section, but its size is significantly different from
		// the original, assume it's a false positive
		$stateCountTotal = ($stateCount[0] + $stateCount[1] + $stateCount[2] + $stateCount[3] + $stateCount[4]);

		if((5 * abs($stateCountTotal - $originalStateCountTotal)) >= $originalStateCountTotal){
			return null;
		}

		if(!$this->foundPatternCross($stateCount)){
			return null;
		}

		return $this->centerFromEnd($stateCount, $j);
	}

	/**
	 * This is called when a horizontal scan finds a possible alignment pattern. It will
	 * cross-check with a vertical scan, and if successful, will, ah, cross-cross-check
	 * with another horizontal scan. This is needed primarily to locate the real horizontal
	 * center of the pattern in cases of extreme skew.
	 * And then we cross-cross-cross check with another diagonal scan.
	 *
	 * If that succeeds the finder pattern location is added to a list that tracks
	 * the number of times each location has been nearly-matched as a finder pattern.
	 * Each additional find is more evidence that the location is in fact a finder
	 * pattern center
	 *
	 * @param int[] $stateCount reading state module counts from horizontal scan
	 * @param int   $i          row where finder pattern may be found
	 * @param int   $j          end of possible finder pattern in row
	 *
	 * @return bool if a finder pattern candidate was found this time
	 */
	private function handlePossibleCenter(array $stateCount, int $i, int $j):bool{
		$stateCountTotal = ($stateCount[0] + $stateCount[1] + $stateCount[2] + $stateCount[3] + $stateCount[4]);
		$centerJ         = $this->centerFromEnd($stateCount, $j);
		$centerI         = $this->crossCheckVertical($i, (int)$centerJ, $stateCount[2], $stateCountTotal);

		if($centerI !== null){
			// Re-cross check
			$centerJ = $this->crossCheckHorizontal((int)$centerJ, (int)$centerI, $stateCount[2], $stateCountTotal);
			if($centerJ !== null && ($this->crossCheckDiagonal((int)$centerI, (int)$centerJ))){
				$estimatedModuleSize = ($stateCountTotal / 7.0);
				$found               = false;

				// cautious (was in for fool in which $this->possibleCenters is updated)
				$count = count($this->possibleCenters);

				for($index = 0; $index < $count; $index++){
					$center = $this->possibleCenters[$index];
					// Look for about the same center and module size:
					if($center->aboutEquals($estimatedModuleSize, $centerI, $centerJ)){
						$this->possibleCenters[$index] = $center->combineEstimate($centerI, $centerJ, $estimatedModuleSize);
						$found                         = true;
						break;
					}
				}

				if(!$found){
					$point                   = new FinderPattern($centerJ, $centerI, $estimatedModuleSize);
					$this->possibleCenters[] = $point;
				}

				return true;
			}
		}

		return false;
	}

	/**
	 * @return int number of rows we could safely skip during scanning, based on the first
	 *         two finder patterns that have been located. In some cases their position will
	 *         allow us to infer that the third pattern must lie below a certain point farther
	 *         down in the image.
	 */
	private function findRowSkip():int{
		$max = count($this->possibleCenters);

		if($max <= 1){
			return 0;
		}

		$firstConfirmedCenter = null;

		foreach($this->possibleCenters as $center){

			if($center->getCount() >= self::CENTER_QUORUM){

				if($firstConfirmedCenter === null){
					$firstConfirmedCenter = $center;
				}
				else{
					// We have two confirmed centers
					// How far down can we skip before resuming looking for the next
					// pattern? In the worst case, only the difference between the
					// difference in the x / y coordinates of the two centers.
					// This is the case where you find top left last.
					$this->hasSkipped = true;

					return (int)((abs($firstConfirmedCenter->getX() - $center->getX()) -
					              abs($firstConfirmedCenter->getY() - $center->getY())) / 2);
				}
			}
		}

		return 0;
	}

	/**
	 * @return bool true if we have found at least 3 finder patterns that have been detected
	 *              at least #CENTER_QUORUM times each, and, the estimated module size of the
	 *              candidates is "pretty similar"
	 */
	private function haveMultiplyConfirmedCenters():bool{
		$confirmedCount  = 0;
		$totalModuleSize = 0.0;
		$max             = count($this->possibleCenters);

		foreach($this->possibleCenters as $pattern){
			if($pattern->getCount() >= self::CENTER_QUORUM){
				$confirmedCount++;
				$totalModuleSize += $pattern->getEstimatedModuleSize();
			}
		}

		if($confirmedCount < 3){
			return false;
		}
		// OK, we have at least 3 confirmed centers, but, it's possible that one is a "false positive"
		// and that we need to keep looking. We detect this by asking if the estimated module sizes
		// vary too much. We arbitrarily say that when the total deviation from average exceeds
		// 5% of the total module size estimates, it's too much.
		$average        = ($totalModuleSize / (float)$max);
		$totalDeviation = 0.0;

		foreach($this->possibleCenters as $pattern){
			$totalDeviation += abs($pattern->getEstimatedModuleSize() - $average);
		}

		return $totalDeviation <= (0.05 * $totalModuleSize);
	}

	/**
	 * @return \chillerlan\QRCode\Detector\FinderPattern[] the 3 best FinderPatterns from our list of candidates. The "best" are
	 *         those that have been detected at least #CENTER_QUORUM times, and whose module
	 *         size differs from the average among those patterns the least
	 * @throws \chillerlan\QRCode\Detector\QRCodeDetectorException if 3 such finder patterns do not exist
	 */
	private function selectBestPatterns():array{
		$startSize = count($this->possibleCenters);

		if($startSize < 3){
			throw new QRCodeDetectorException('could not find enough finder patterns');
		}

		usort(
			$this->possibleCenters,
			fn(FinderPattern $a, FinderPattern $b) => ($a->getEstimatedModuleSize() <=> $b->getEstimatedModuleSize())
		);

		$distortion   = PHP_FLOAT_MAX;
		$bestPatterns = [];

		for($i = 0; $i < ($startSize - 2); $i++){
			$fpi           = $this->possibleCenters[$i];
			$minModuleSize = $fpi->getEstimatedModuleSize();

			for($j = ($i + 1); $j < ($startSize - 1); $j++){
				$fpj      = $this->possibleCenters[$j];
				$squares0 = $fpi->getSquaredDistance($fpj);

				for($k = ($j + 1); $k < $startSize; $k++){
					$fpk           = $this->possibleCenters[$k];
					$maxModuleSize = $fpk->getEstimatedModuleSize();

					// module size is not similar
					if($maxModuleSize > ($minModuleSize * 1.4)){
						continue;
					}

					$a = $squares0;
					$b = $fpj->getSquaredDistance($fpk);
					$c = $fpi->getSquaredDistance($fpk);

					// sorts ascending - inlined
					if($a < $b){
						if($b > $c){
							if($a < $c){
								$temp = $b;
								$b    = $c;
								$c    = $temp;
							}
							else{
								$temp = $a;
								$a    = $c;
								$c    = $b;
								$b    = $temp;
							}
						}
					}
					else{
						if($b < $c){
							if($a < $c){
								$temp = $a;
								$a    = $b;
								$b    = $temp;
							}
							else{
								$temp = $a;
								$a    = $b;
								$b    = $c;
								$c    = $temp;
							}
						}
						else{
							$temp = $a;
							$a    = $c;
							$c    = $temp;
						}
					}

					// a^2 + b^2 = c^2 (Pythagorean theorem), and a = b (isosceles triangle).
					// Since any right triangle satisfies the formula c^2 - b^2 - a^2 = 0,
					// we need to check both two equal sides separately.
					// The value of |c^2 - 2 * b^2| + |c^2 - 2 * a^2| increases as dissimilarity
					// from isosceles right triangle.
					$d = (abs($c - 2 * $b) + abs($c - 2 * $a));

					if($d < $distortion){
						$distortion   = $d;
						$bestPatterns = [$fpi, $fpj, $fpk];
					}
				}
			}
		}

		if($distortion === PHP_FLOAT_MAX){
			throw new QRCodeDetectorException('finder patterns may be too distorted');
		}

		return $bestPatterns;
	}

	/**
	 * Orders an array of three ResultPoints in an order [A,B,C] such that AB is less than AC
	 * and BC is less than AC, and the angle between BC and BA is less than 180 degrees.
	 *
	 * @param \chillerlan\QRCode\Detector\FinderPattern[] $patterns array of three FinderPattern to order
	 *
	 * @return \chillerlan\QRCode\Detector\FinderPattern[]
	 */
	private function orderBestPatterns(array $patterns):array{

		// Find distances between pattern centers
		$zeroOneDistance = $patterns[0]->getDistance($patterns[1]);
		$oneTwoDistance  = $patterns[1]->getDistance($patterns[2]);
		$zeroTwoDistance = $patterns[0]->getDistance($patterns[2]);

		// Assume one closest to other two is B; A and C will just be guesses at first
		if($oneTwoDistance >= $zeroOneDistance && $oneTwoDistance >= $zeroTwoDistance){
			[$pointB, $pointA, $pointC] = $patterns;
		}
		elseif($zeroTwoDistance >= $oneTwoDistance && $zeroTwoDistance >= $zeroOneDistance){
			[$pointA, $pointB, $pointC] = $patterns;
		}
		else{
			[$pointA, $pointC, $pointB] = $patterns;
		}

		// Use cross product to figure out whether A and C are correct or flipped.
		// This asks whether BC x BA has a positive z component, which is the arrangement
		// we want for A, B, C. If it's negative, then we've got it flipped around and
		// should swap A and C.
		if($this->crossProductZ($pointA, $pointB, $pointC) < 0.0){
			$temp   = $pointA;
			$pointA = $pointC;
			$pointC = $temp;
		}

		return [$pointA, $pointB, $pointC];
	}

	/**
	 * Returns the z component of the cross product between vectors BC and BA.
	 */
	private function crossProductZ(FinderPattern $pointA, FinderPattern $pointB, FinderPattern $pointC):float{
		$bX = $pointB->getX();
		$bY = $pointB->getY();

		return ((($pointC->getX() - $bX) * ($pointA->getY() - $bY)) - (($pointC->getY() - $bY) * ($pointA->getX() - $bX)));
	}

}
