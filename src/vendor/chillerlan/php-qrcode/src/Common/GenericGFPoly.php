<?php
/**
 * Class GenericGFPoly
 *
 * @created      16.01.2021
 * @author       ZXing Authors
 * @author       Smiley <smiley@chillerlan.net>
 * @copyright    2021 Smiley
 * @license      Apache-2.0
 */

namespace chillerlan\QRCode\Common;

use chillerlan\QRCode\QRCodeException;
use function array_fill, array_slice, array_splice, count;

/**
 * Represents a polynomial whose coefficients are elements of a GF.
 * Instances of this class are immutable.
 *
 * Much credit is due to William Rucklidge since portions of this code are an indirect
 * port of his C++ Reed-Solomon implementation.
 *
 * @author Sean Owen
 */
final class GenericGFPoly{

	private array $coefficients;

	/**
	 * @param array      $coefficients array coefficients as ints representing elements of GF(size), arranged
	 *                                 from most significant (highest-power term) coefficient to the least significant
	 * @param int|null   $degree
	 *
	 * @throws \chillerlan\QRCode\QRCodeException if argument is null or empty, or if leading coefficient is 0 and this
	 *                                            is not a constant polynomial (that is, it is not the monomial "0")
	 */
	public function __construct(array $coefficients, int $degree = null){
		$degree ??= 0;

		if(empty($coefficients)){
			throw new QRCodeException('arg $coefficients is empty');
		}

		if($degree < 0){
			throw new QRCodeException('negative degree');
		}

		$coefficientsLength = count($coefficients);

		// Leading term must be non-zero for anything except the constant polynomial "0"
		$firstNonZero = 0;

		while($firstNonZero < $coefficientsLength && $coefficients[$firstNonZero] === 0){
			$firstNonZero++;
		}

		$this->coefficients = [0];

		if($firstNonZero !== $coefficientsLength){
			$this->coefficients = array_fill(0, ($coefficientsLength - $firstNonZero + $degree), 0);

			for($i = 0; $i < ($coefficientsLength - $firstNonZero); $i++){
				$this->coefficients[$i] = $coefficients[($i + $firstNonZero)];
			}
		}

	}

	/**
	 * @return int $coefficient of x^degree term in this polynomial
	 */
	public function getCoefficient(int $degree):int{
		return $this->coefficients[(count($this->coefficients) - 1 - $degree)];
	}

	/**
	 * @return int[]
	 */
	public function getCoefficients():array{
		return $this->coefficients;
	}

	/**
	 * @return int $degree of this polynomial
	 */
	public function getDegree():int{
		return (count($this->coefficients) - 1);
	}

	/**
	 * @return bool true if this polynomial is the monomial "0"
	 */
	public function isZero():bool{
		return $this->coefficients[0] === 0;
	}

	/**
	 * @return int evaluation of this polynomial at a given point
	 */
	public function evaluateAt(int $a):int{

		if($a === 0){
			// Just return the x^0 coefficient
			return $this->getCoefficient(0);
		}

		$result = 0;

		foreach($this->coefficients as $c){
			// if $a === 1 just the sum of the coefficients
			$result = GF256::addOrSubtract((($a === 1) ? $result : GF256::multiply($a, $result)), $c);
		}

		return $result;
	}

	/**
	 *
	 */
	public function multiply(GenericGFPoly $other):self{

		if($this->isZero() || $other->isZero()){
			return new self([0]);
		}

		$product = array_fill(0, (count($this->coefficients) + count($other->coefficients) - 1), 0);

		foreach($this->coefficients as $i => $aCoeff){
			foreach($other->coefficients as $j => $bCoeff){
				$product[($i + $j)] ^= GF256::multiply($aCoeff, $bCoeff);
			}
		}

		return new self($product);
	}

	/**
	 * @return \chillerlan\QRCode\Common\GenericGFPoly[] [quotient, remainder]
	 * @throws \chillerlan\QRCode\QRCodeException
	 */
	public function divide(GenericGFPoly $other):array{

		if($other->isZero()){
			throw new QRCodeException('Division by 0');
		}

		$quotient  = new self([0]);
		$remainder = clone $this;

		$denominatorLeadingTerm        = $other->getCoefficient($other->getDegree());
		$inverseDenominatorLeadingTerm = GF256::inverse($denominatorLeadingTerm);

		while($remainder->getDegree() >= $other->getDegree() && !$remainder->isZero()){
			$scale     = GF256::multiply($remainder->getCoefficient($remainder->getDegree()), $inverseDenominatorLeadingTerm);
			$diff      = ($remainder->getDegree() - $other->getDegree());
			$quotient  = $quotient->addOrSubtract(GF256::buildMonomial($diff, $scale));
			$remainder = $remainder->addOrSubtract($other->multiplyByMonomial($diff, $scale));
		}

		return [$quotient, $remainder];

	}

	/**
	 *
	 */
	public function multiplyInt(int $scalar):self{

		if($scalar === 0){
			return new self([0]);
		}

		if($scalar === 1){
			return $this;
		}

		$product = array_fill(0, count($this->coefficients), 0);

		foreach($this->coefficients as $i => $c){
			$product[$i] = GF256::multiply($c, $scalar);
		}

		return new self($product);
	}

	/**
	 * @throws \chillerlan\QRCode\QRCodeException
	 */
	public function multiplyByMonomial(int $degree, int $coefficient):self{

		if($degree < 0){
			throw new QRCodeException('degree < 0');
		}

		if($coefficient === 0){
			return new self([0]);
		}

		$product = array_fill(0, (count($this->coefficients) + $degree), 0);

		foreach($this->coefficients as $i => $c){
			$product[$i] = GF256::multiply($c, $coefficient);
		}

		return new self($product);
	}

	/**
	 *
	 */
	public function mod(GenericGFPoly $other):self{

		if((count($this->coefficients) - count($other->coefficients)) < 0){
			return $this;
		}

		$ratio = (GF256::log($this->coefficients[0]) - GF256::log($other->coefficients[0]));

		foreach($other->coefficients as $i => $c){
			$this->coefficients[$i] ^= GF256::exp(GF256::log($c) + $ratio);
		}

		return (new self($this->coefficients))->mod($other);
	}

	/**
	 *
	 */
	public function addOrSubtract(GenericGFPoly $other):self{

		if($this->isZero()){
			return $other;
		}

		if($other->isZero()){
			return $this;
		}

		$smallerCoefficients = $this->coefficients;
		$largerCoefficients  = $other->coefficients;

		if(count($smallerCoefficients) > count($largerCoefficients)){
			$temp                = $smallerCoefficients;
			$smallerCoefficients = $largerCoefficients;
			$largerCoefficients  = $temp;
		}

		$sumDiff    = array_fill(0, count($largerCoefficients), 0);
		$lengthDiff = (count($largerCoefficients) - count($smallerCoefficients));
		// Copy high-order terms only found in higher-degree polynomial's coefficients
		array_splice($sumDiff, 0, $lengthDiff, array_slice($largerCoefficients, 0, $lengthDiff));

		$countLargerCoefficients = count($largerCoefficients);

		for($i = $lengthDiff; $i < $countLargerCoefficients; $i++){
			$sumDiff[$i] = GF256::addOrSubtract($smallerCoefficients[($i - $lengthDiff)], $largerCoefficients[$i]);
		}

		return new self($sumDiff);
	}

}
