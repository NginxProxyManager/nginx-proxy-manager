<?php
/**
 * Class FinderPattern
 *
 * @created      17.01.2021
 * @author       ZXing Authors
 * @author       Smiley <smiley@chillerlan.net>
 * @copyright    2021 Smiley
 * @license      Apache-2.0
 */

namespace chillerlan\QRCode\Detector;

use function sqrt;

/**
 * Encapsulates a finder pattern, which are the three square patterns found in
 * the corners of QR Codes. It also encapsulates a count of similar finder patterns,
 * as a convenience to the finder's bookkeeping.
 *
 * @author Sean Owen
 */
final class FinderPattern extends ResultPoint{

	private int $count;

	/**
	 *
	 */
	public function __construct(float $posX, float $posY, float $estimatedModuleSize, int $count = null){
		parent::__construct($posX, $posY, $estimatedModuleSize);

		$this->count = ($count ?? 1);
	}

	/**
	 *
	 */
	public function getCount():int{
		return $this->count;
	}

	/**
	 * @param \chillerlan\QRCode\Detector\FinderPattern $b second pattern
	 *
	 * @return float distance between two points
	 */
	public function getDistance(FinderPattern $b):float{
		return self::distance($this->x, $this->y, $b->x, $b->y);
	}

	/**
	 * Get square of distance between a and b.
	 */
	public function getSquaredDistance(FinderPattern $b):float{
		return self::squaredDistance($this->x, $this->y, $b->x, $b->y);
	}

	/**
	 * Combines this object's current estimate of a finder pattern position and module size
	 * with a new estimate. It returns a new FinderPattern containing a weighted average
	 * based on count.
	 */
	public function combineEstimate(float $i, float $j, float $newModuleSize):self{
		$combinedCount = ($this->count + 1);

		return new self(
			($this->count * $this->x + $j) / $combinedCount,
			($this->count * $this->y + $i) / $combinedCount,
			($this->count * $this->estimatedModuleSize + $newModuleSize) / $combinedCount,
			$combinedCount
		);
	}

	/**
	 *
	 */
	private static function squaredDistance(float $aX, float $aY, float $bX, float $bY):float{
		$xDiff = ($aX - $bX);
		$yDiff = ($aY - $bY);

		return ($xDiff * $xDiff + $yDiff * $yDiff);
	}

	/**
	 *
	 */
	public static function distance(float $aX, float $aY, float $bX, float $bY):float{
		return sqrt(self::squaredDistance($aX, $aY, $bX, $bY));
	}

}
