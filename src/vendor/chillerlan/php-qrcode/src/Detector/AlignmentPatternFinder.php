<?php
/**
 * Class AlignmentPatternFinder
 *
 * @created      17.01.2021
 * @author       ZXing Authors
 * @author       Smiley <smiley@chillerlan.net>
 * @copyright    2021 Smiley
 * @license      Apache-2.0
 */

namespace chillerlan\QRCode\Detector;

use chillerlan\QRCode\Decoder\BitMatrix;
use function abs, count;

/**
 * This class attempts to find alignment patterns in a QR Code. Alignment patterns look like finder
 * patterns but are smaller and appear at regular intervals throughout the image.
 *
 * At the moment this only looks for the bottom-right alignment pattern.
 *
 * This is mostly a simplified copy of FinderPatternFinder. It is copied,
 * pasted and stripped down here for maximum performance but does unfortunately duplicate
 * some code.
 *
 * This class is thread-safe but not reentrant. Each thread must allocate its own object.
 *
 * @author Sean Owen
 */
final class AlignmentPatternFinder{

	private BitMatrix $matrix;
	private float     $moduleSize;
	/** @var \chillerlan\QRCode\Detector\AlignmentPattern[] */
	private array $possibleCenters;

	/**
	 * Creates a finder that will look in a portion of the whole image.
	 *
	 * @param \chillerlan\QRCode\Decoder\BitMatrix $matrix     image to search
	 * @param float                                $moduleSize estimated module size so far
	 */
	public function __construct(BitMatrix $matrix, float $moduleSize){
		$this->matrix          = $matrix;
		$this->moduleSize      = $moduleSize;
		$this->possibleCenters = [];
	}

	/**
	 * This method attempts to find the bottom-right alignment pattern in the image. It is a bit messy since
	 * it's pretty performance-critical and so is written to be fast foremost.
	 *
	 * @param int $startX left column from which to start searching
	 * @param int $startY top row from which to start searching
	 * @param int $width  width of region to search
	 * @param int $height height of region to search
	 *
	 * @return \chillerlan\QRCode\Detector\AlignmentPattern|null
	 */
	public function find(int $startX, int $startY, int $width, int $height):?AlignmentPattern{
		$maxJ       = ($startX + $width);
		$middleI    = ($startY + ($height / 2));
		$stateCount = [];

		// We are looking for black/white/black modules in 1:1:1 ratio;
		// this tracks the number of black/white/black modules seen so far
		for($iGen = 0; $iGen < $height; $iGen++){
			// Search from middle outwards
			$i             = (int)($middleI + ((($iGen & 0x01) === 0) ? ($iGen + 1) / 2 : -(($iGen + 1) / 2)));
			$stateCount[0] = 0;
			$stateCount[1] = 0;
			$stateCount[2] = 0;
			$j             = $startX;
			// Burn off leading white pixels before anything else; if we start in the middle of
			// a white run, it doesn't make sense to count its length, since we don't know if the
			// white run continued to the left of the start point
			while($j < $maxJ && !$this->matrix->check($j, $i)){
				$j++;
			}

			$currentState = 0;

			while($j < $maxJ){

				if($this->matrix->check($j, $i)){
					// Black pixel
					if($currentState === 1){ // Counting black pixels
						$stateCount[$currentState]++;
					}
					// Counting white pixels
					else{
						// A winner?
						if($currentState === 2){
							// Yes
							if($this->foundPatternCross($stateCount)){
								$confirmed = $this->handlePossibleCenter($stateCount, $i, $j);

								if($confirmed !== null){
									return $confirmed;
								}
							}

							$stateCount[0] = $stateCount[2];
							$stateCount[1] = 1;
							$stateCount[2] = 0;
							$currentState  = 1;
						}
						else{
							$stateCount[++$currentState]++;
						}
					}
				}
				// White pixel
				else{
					// Counting black pixels
					if($currentState === 1){
						$currentState++;
					}

					$stateCount[$currentState]++;
				}

				$j++;
			}

			if($this->foundPatternCross($stateCount)){
				$confirmed = $this->handlePossibleCenter($stateCount, $i, $maxJ);

				if($confirmed !== null){
					return $confirmed;
				}
			}

		}

		// Hmm, nothing we saw was observed and confirmed twice. If we had
		// any guess at all, return it.
		if(count($this->possibleCenters)){
			return $this->possibleCenters[0];
		}

		return null;
	}

	/**
	 * @param int[] $stateCount count of black/white/black pixels just read
	 *
	 * @return bool true if the proportions of the counts is close enough to the 1/1/1 ratios
	 *         used by alignment patterns to be considered a match
	 */
	private function foundPatternCross(array $stateCount):bool{
		$maxVariance = ($this->moduleSize / 2.0);

		for($i = 0; $i < 3; $i++){
			if(abs($this->moduleSize - $stateCount[$i]) >= $maxVariance){
				return false;
			}
		}

		return true;
	}

	/**
	 * This is called when a horizontal scan finds a possible alignment pattern. It will
	 * cross-check with a vertical scan, and if successful, will see if this pattern had been
	 * found on a previous horizontal scan. If so, we consider it confirmed and conclude we have
	 * found the alignment pattern.
	 *
	 * @param int[] $stateCount reading state module counts from horizontal scan
	 * @param int   $i          row where alignment pattern may be found
	 * @param int   $j          end of possible alignment pattern in row
	 *
	 * @return \chillerlan\QRCode\Detector\AlignmentPattern|null if we have found the same pattern twice, or null if not
	 */
	private function handlePossibleCenter(array $stateCount, int $i, int $j):?AlignmentPattern{
		$stateCountTotal = ($stateCount[0] + $stateCount[1] + $stateCount[2]);
		$centerJ         = $this->centerFromEnd($stateCount, $j);
		$centerI         = $this->crossCheckVertical($i, (int)$centerJ, (2 * $stateCount[1]), $stateCountTotal);

		if($centerI !== null){
			$estimatedModuleSize = (($stateCount[0] + $stateCount[1] + $stateCount[2]) / 3.0);

			foreach($this->possibleCenters as $center){
				// Look for about the same center and module size:
				if($center->aboutEquals($estimatedModuleSize, $centerI, $centerJ)){
					return $center->combineEstimate($centerI, $centerJ, $estimatedModuleSize);
				}
			}

			// Hadn't found this before; save it
			$point                   = new AlignmentPattern($centerJ, $centerI, $estimatedModuleSize);
			$this->possibleCenters[] = $point;
		}

		return null;
	}

	/**
	 * Given a count of black/white/black pixels just seen and an end position,
	 * figures the location of the center of this black/white/black run.
	 *
	 * @param int[] $stateCount
	 * @param int   $end
	 *
	 * @return float
	 */
	private function centerFromEnd(array $stateCount, int $end):float{
		return (float)(($end - $stateCount[2]) - $stateCount[1] / 2);
	}

	/**
	 * After a horizontal scan finds a potential alignment pattern, this method
	 * "cross-checks" by scanning down vertically through the center of the possible
	 * alignment pattern to see if the same proportion is detected.
	 *
	 * @param int $startI   row where an alignment pattern was detected
	 * @param int $centerJ  center of the section that appears to cross an alignment pattern
	 * @param int $maxCount maximum reasonable number of modules that should be
	 *                      observed in any reading state, based on the results of the horizontal scan
	 * @param int $originalStateCountTotal
	 *
	 * @return float|null vertical center of alignment pattern, or null if not found
	 */
	private function crossCheckVertical(int $startI, int $centerJ, int $maxCount, int $originalStateCountTotal):?float{
		$maxI          = $this->matrix->getSize();
		$stateCount    = [];
		$stateCount[0] = 0;
		$stateCount[1] = 0;
		$stateCount[2] = 0;

		// Start counting up from center
		$i = $startI;
		while($i >= 0 && $this->matrix->check($centerJ, $i) && $stateCount[1] <= $maxCount){
			$stateCount[1]++;
			$i--;
		}
		// If already too many modules in this state or ran off the edge:
		if($i < 0 || $stateCount[1] > $maxCount){
			return null;
		}

		while($i >= 0 && !$this->matrix->check($centerJ, $i) && $stateCount[0] <= $maxCount){
			$stateCount[0]++;
			$i--;
		}

		if($stateCount[0] > $maxCount){
			return null;
		}

		// Now also count down from center
		$i = ($startI + 1);
		while($i < $maxI && $this->matrix->check($centerJ, $i) && $stateCount[1] <= $maxCount){
			$stateCount[1]++;
			$i++;
		}

		if($i == $maxI || $stateCount[1] > $maxCount){
			return null;
		}

		while($i < $maxI && !$this->matrix->check($centerJ, $i) && $stateCount[2] <= $maxCount){
			$stateCount[2]++;
			$i++;
		}

		if($stateCount[2] > $maxCount){
			return null;
		}

		if((5 * abs(($stateCount[0] + $stateCount[1] + $stateCount[2]) - $originalStateCountTotal)) >= (2 * $originalStateCountTotal)){
			return null;
		}

		if(!$this->foundPatternCross($stateCount)){
			return null;
		}

		return $this->centerFromEnd($stateCount, $i);
	}

}
