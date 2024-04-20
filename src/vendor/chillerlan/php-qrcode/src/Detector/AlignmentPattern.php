<?php
/**
 * Class AlignmentPattern
 *
 * @created      17.01.2021
 * @author       ZXing Authors
 * @author       Smiley <smiley@chillerlan.net>
 * @copyright    2021 Smiley
 * @license      Apache-2.0
 */

namespace chillerlan\QRCode\Detector;

/**
 * Encapsulates an alignment pattern, which are the smaller square patterns found in
 * all but the simplest QR Codes.
 *
 * @author Sean Owen
 */
final class AlignmentPattern extends ResultPoint{

	/**
	 * Combines this object's current estimate of a finder pattern position and module size
	 * with a new estimate. It returns a new FinderPattern containing an average of the two.
	 */
	public function combineEstimate(float $i, float $j, float $newModuleSize):self{
		return new self(
			(($this->x + $j) / 2.0),
			(($this->y + $i) / 2.0),
			(($this->estimatedModuleSize + $newModuleSize) / 2.0)
		);
	}

}
