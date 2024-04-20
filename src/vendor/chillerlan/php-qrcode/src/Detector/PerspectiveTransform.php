<?php
/**
 * Class PerspectiveTransform
 *
 * @created      17.01.2021
 * @author       ZXing Authors
 * @author       Smiley <smiley@chillerlan.net>
 * @copyright    2021 Smiley
 * @license      Apache-2.0
 */

namespace chillerlan\QRCode\Detector;

use function count;

/**
 * This class implements a perspective transform in two dimensions. Given four source and four
 * destination points, it will compute the transformation implied between them. The code is based
 * directly upon section 3.4.2 of George Wolberg's "Digital Image Warping"; see pages 54-56.
 *
 * @author Sean Owen
 */
final class PerspectiveTransform{

	private float $a11;
	private float $a12;
	private float $a13;
	private float $a21;
	private float $a22;
	private float $a23;
	private float $a31;
	private float $a32;
	private float $a33;

	/**
	 *
	 */
	private function set(
		float $a11, float $a21, float $a31,
		float $a12, float $a22, float $a32,
		float $a13, float $a23, float $a33
	):self{
		$this->a11 = $a11;
		$this->a12 = $a12;
		$this->a13 = $a13;
		$this->a21 = $a21;
		$this->a22 = $a22;
		$this->a23 = $a23;
		$this->a31 = $a31;
		$this->a32 = $a32;
		$this->a33 = $a33;

		return $this;
	}

	/**
	 * @SuppressWarnings(PHPMD.ExcessiveParameterList)
	 */
	public function quadrilateralToQuadrilateral(
		float $x0, float $y0, float $x1, float $y1, float $x2, float $y2, float $x3, float $y3,
		float $x0p, float $y0p, float $x1p, float $y1p, float $x2p, float $y2p, float $x3p, float $y3p
	):self{
		return (new self)
			->squareToQuadrilateral($x0p, $y0p, $x1p, $y1p, $x2p, $y2p, $x3p, $y3p)
			->times($this->quadrilateralToSquare($x0, $y0, $x1, $y1, $x2, $y2, $x3, $y3));
	}

	/**
	 *
	 */
	private function quadrilateralToSquare(
		float $x0, float $y0, float $x1, float $y1,
		float $x2, float $y2, float $x3, float $y3
	):self{
		// Here, the adjoint serves as the inverse:
		return $this
			->squareToQuadrilateral($x0, $y0, $x1, $y1, $x2, $y2, $x3, $y3)
			->buildAdjoint();
	}

	/**
	 *
	 */
	private function buildAdjoint():self{
		// Adjoint is the transpose of the cofactor matrix:
		return $this->set(
			($this->a22 * $this->a33 - $this->a23 * $this->a32),
			($this->a23 * $this->a31 - $this->a21 * $this->a33),
			($this->a21 * $this->a32 - $this->a22 * $this->a31),
			($this->a13 * $this->a32 - $this->a12 * $this->a33),
			($this->a11 * $this->a33 - $this->a13 * $this->a31),
			($this->a12 * $this->a31 - $this->a11 * $this->a32),
			($this->a12 * $this->a23 - $this->a13 * $this->a22),
			($this->a13 * $this->a21 - $this->a11 * $this->a23),
			($this->a11 * $this->a22 - $this->a12 * $this->a21)
		);
	}

	/**
	 *
	 */
	private function squareToQuadrilateral(
		float $x0, float $y0, float $x1, float $y1,
		float $x2, float $y2, float $x3, float $y3
	):self{
		$dx3 = ($x0 - $x1 + $x2 - $x3);
		$dy3 = ($y0 - $y1 + $y2 - $y3);

		if($dx3 === 0.0 && $dy3 === 0.0){
			// Affine
			return $this->set(($x1 - $x0), ($x2 - $x1), $x0, ($y1 - $y0), ($y2 - $y1), $y0, 0.0, 0.0, 1.0);
		}

		$dx1         = ($x1 - $x2);
		$dx2         = ($x3 - $x2);
		$dy1         = ($y1 - $y2);
		$dy2         = ($y3 - $y2);
		$denominator = ($dx1 * $dy2 - $dx2 * $dy1);
		$a13         = (($dx3 * $dy2 - $dx2 * $dy3) / $denominator);
		$a23         = (($dx1 * $dy3 - $dx3 * $dy1) / $denominator);

		return $this->set(
			($x1 - $x0 + $a13 * $x1),
			($x3 - $x0 + $a23 * $x3),
			$x0,
			($y1 - $y0 + $a13 * $y1),
			($y3 - $y0 + $a23 * $y3),
			$y0,
			$a13,
			$a23,
			1.0
		);
	}

	/**
	 *
	 */
	private function times(PerspectiveTransform $other):self{
		return $this->set(
			($this->a11 * $other->a11 + $this->a21 * $other->a12 + $this->a31 * $other->a13),
			($this->a11 * $other->a21 + $this->a21 * $other->a22 + $this->a31 * $other->a23),
			($this->a11 * $other->a31 + $this->a21 * $other->a32 + $this->a31 * $other->a33),
			($this->a12 * $other->a11 + $this->a22 * $other->a12 + $this->a32 * $other->a13),
			($this->a12 * $other->a21 + $this->a22 * $other->a22 + $this->a32 * $other->a23),
			($this->a12 * $other->a31 + $this->a22 * $other->a32 + $this->a32 * $other->a33),
			($this->a13 * $other->a11 + $this->a23 * $other->a12 + $this->a33 * $other->a13),
			($this->a13 * $other->a21 + $this->a23 * $other->a22 + $this->a33 * $other->a23),
			($this->a13 * $other->a31 + $this->a23 * $other->a32 + $this->a33 * $other->a33)
		);
	}

	/**
	 * @return array[] [$xValues, $yValues]
	 */
	public function transformPoints(array $xValues, array $yValues = null):array{
		$max = count($xValues);

		if($yValues !== null){ // unused

			for($i = 0; $i < $max; $i++){
				$x           = $xValues[$i];
				$y           = $yValues[$i];
				$denominator = ($this->a13 * $x + $this->a23 * $y + $this->a33);
				$xValues[$i] = (($this->a11 * $x + $this->a21 * $y + $this->a31) / $denominator);
				$yValues[$i] = (($this->a12 * $x + $this->a22 * $y + $this->a32) / $denominator);
			}

			return [$xValues, $yValues];
		}

		for($i = 0; $i < $max; $i += 2){
			$x                 = $xValues[$i];
			$y                 = $xValues[($i + 1)];
			$denominator       = ($this->a13 * $x + $this->a23 * $y + $this->a33);
			$xValues[$i]       = (($this->a11 * $x + $this->a21 * $y + $this->a31) / $denominator);
			$xValues[($i + 1)] = (($this->a12 * $x + $this->a22 * $y + $this->a32) / $denominator);
		}

		return [$xValues, []];
	}

}
