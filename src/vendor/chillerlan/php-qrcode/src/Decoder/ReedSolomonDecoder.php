<?php
/**
 * Class ReedSolomonDecoder
 *
 * @created      24.01.2021
 * @author       ZXing Authors
 * @author       Smiley <smiley@chillerlan.net>
 * @copyright    2021 Smiley
 * @license      Apache-2.0
 */

namespace chillerlan\QRCode\Decoder;

use chillerlan\QRCode\Common\{BitBuffer, EccLevel, GenericGFPoly, GF256, Version};
use function array_fill, array_reverse, count;

/**
 * Implements Reed-Solomon decoding
 *
 * The algorithm will not be explained here, but the following references were helpful
 * in creating this implementation:
 *
 * - Bruce Maggs "Decoding Reed-Solomon Codes" (see discussion of Forney's Formula)
 *   http://www.cs.cmu.edu/afs/cs.cmu.edu/project/pscico-guyb/realworld/www/rs_decode.ps
 * - J.I. Hall. "Chapter 5. Generalized Reed-Solomon Codes" (see discussion of Euclidean algorithm)
 *   https://users.math.msu.edu/users/halljo/classes/codenotes/GRS.pdf
 *
 * Much credit is due to William Rucklidge since portions of this code are an indirect
 * port of his C++ Reed-Solomon implementation.
 *
 * @author Sean Owen
 * @author William Rucklidge
 * @author sanfordsquires
 */
final class ReedSolomonDecoder{

	private Version  $version;
	private EccLevel $eccLevel;

	/**
	 * ReedSolomonDecoder constructor
	 */
	public function __construct(Version $version, EccLevel $eccLevel){
		$this->version  = $version;
		$this->eccLevel = $eccLevel;
	}

	/**
	 * Error-correct and copy data blocks together into a stream of bytes
	 */
	public function decode(array $rawCodewords):BitBuffer{
		$dataBlocks  = $this->deinterleaveRawBytes($rawCodewords);
		$dataBytes   = [];

		foreach($dataBlocks as [$numDataCodewords, $codewordBytes]){
			$corrected = $this->correctErrors($codewordBytes, $numDataCodewords);

			for($i = 0; $i < $numDataCodewords; $i++){
				$dataBytes[] = $corrected[$i];
			}
		}

		return new BitBuffer($dataBytes);
	}

	/**
	 * When QR Codes use multiple data blocks, they are actually interleaved.
	 * That is, the first byte of data block 1 to n is written, then the second bytes, and so on. This
	 * method will separate the data into original blocks.
	 *
	 * @throws \chillerlan\QRCode\Decoder\QRCodeDecoderException
	 */
	private function deinterleaveRawBytes(array $rawCodewords):array{
		// Figure out the number and size of data blocks used by this version and
		// error correction level
		[$numEccCodewords, $eccBlocks] = $this->version->getRSBlocks($this->eccLevel);

		// Now establish DataBlocks of the appropriate size and number of data codewords
		$result          = [];//new DataBlock[$totalBlocks];
		$numResultBlocks = 0;

		foreach($eccBlocks as [$numEccBlocks, $eccPerBlock]){
			for($i = 0; $i < $numEccBlocks; $i++, $numResultBlocks++){
				$result[$numResultBlocks] = [$eccPerBlock, array_fill(0, ($numEccCodewords + $eccPerBlock), 0)];
			}
		}

		// All blocks have the same amount of data, except that the last n
		// (where n may be 0) have 1 more byte. Figure out where these start.
		/** @phan-suppress-next-line PhanTypePossiblyInvalidDimOffset */
		$shorterBlocksTotalCodewords = count($result[0][1]);
		$longerBlocksStartAt         = (count($result) - 1);

		while($longerBlocksStartAt >= 0){
			$numCodewords = count($result[$longerBlocksStartAt][1]);

			if($numCodewords == $shorterBlocksTotalCodewords){
				break;
			}

			$longerBlocksStartAt--;
		}

		$longerBlocksStartAt++;

		$shorterBlocksNumDataCodewords = ($shorterBlocksTotalCodewords - $numEccCodewords);
		// The last elements of result may be 1 element longer;
		// first fill out as many elements as all of them have
		$rawCodewordsOffset = 0;

		for($i = 0; $i < $shorterBlocksNumDataCodewords; $i++){
			for($j = 0; $j < $numResultBlocks; $j++){
				$result[$j][1][$i] = $rawCodewords[$rawCodewordsOffset++];
			}
		}

		// Fill out the last data block in the longer ones
		for($j = $longerBlocksStartAt; $j < $numResultBlocks; $j++){
			$result[$j][1][$shorterBlocksNumDataCodewords] = $rawCodewords[$rawCodewordsOffset++];
		}

		// Now add in error correction blocks
		/** @phan-suppress-next-line PhanTypePossiblyInvalidDimOffset */
		$max = count($result[0][1]);

		for($i = $shorterBlocksNumDataCodewords; $i < $max; $i++){
			for($j = 0; $j < $numResultBlocks; $j++){
				$iOffset                 = ($j < $longerBlocksStartAt) ? $i : ($i + 1);
				$result[$j][1][$iOffset] = $rawCodewords[$rawCodewordsOffset++];
			}
		}

		// DataBlocks containing original bytes, "de-interleaved" from representation in the QR Code
		return $result;
	}

	/**
	 * Given data and error-correction codewords received, possibly corrupted by errors, attempts to
	 * correct the errors in-place using Reed-Solomon error correction.
	 */
	private function correctErrors(array $codewordBytes, int $numDataCodewords):array{
		// First read into an array of ints
		$codewordsInts = [];

		foreach($codewordBytes as $codewordByte){
			$codewordsInts[] = ($codewordByte & 0xFF);
		}

		$decoded = $this->decodeWords($codewordsInts, (count($codewordBytes) - $numDataCodewords));

		// Copy back into array of bytes -- only need to worry about the bytes that were data
		// We don't care about errors in the error-correction codewords
		for($i = 0; $i < $numDataCodewords; $i++){
			$codewordBytes[$i] = $decoded[$i];
		}

		return $codewordBytes;
	}

	/**
	 * Decodes given set of received codewords, which include both data and error-correction
	 * codewords. Really, this means it uses Reed-Solomon to detect and correct errors, in-place,
	 * in the input.
	 *
	 * @param array $received        data and error-correction codewords
	 * @param int   $numEccCodewords number of error-correction codewords available
	 *
	 * @return int[]
	 * @throws \chillerlan\QRCode\Decoder\QRCodeDecoderException if decoding fails for any reason
	 */
	private function decodeWords(array $received, int $numEccCodewords):array{
		$poly                 = new GenericGFPoly($received);
		$syndromeCoefficients = [];
		$error                = false;

		for($i = 0; $i < $numEccCodewords; $i++){
			$syndromeCoefficients[$i] = $poly->evaluateAt(GF256::exp($i));

			if($syndromeCoefficients[$i] !== 0){
				$error = true;
			}
		}

		if(!$error){
			return $received;
		}

		[$sigma, $omega] = $this->runEuclideanAlgorithm(
			GF256::buildMonomial($numEccCodewords, 1),
			new GenericGFPoly(array_reverse($syndromeCoefficients)),
			$numEccCodewords
		);

		$errorLocations      = $this->findErrorLocations($sigma);
		$errorMagnitudes     = $this->findErrorMagnitudes($omega, $errorLocations);
		$errorLocationsCount = count($errorLocations);
		$receivedCount       = count($received);

		for($i = 0; $i < $errorLocationsCount; $i++){
			$position = ($receivedCount - 1 - GF256::log($errorLocations[$i]));

			if($position < 0){
				throw new QRCodeDecoderException('Bad error location');
			}

			$received[$position] ^= $errorMagnitudes[$i];
		}

		return $received;
	}

	/**
	 * @return \chillerlan\QRCode\Common\GenericGFPoly[] [sigma, omega]
	 * @throws \chillerlan\QRCode\Decoder\QRCodeDecoderException
	 */
	private function runEuclideanAlgorithm(GenericGFPoly $a, GenericGFPoly $b, int $z):array{
		// Assume a's degree is >= b's
		if($a->getDegree() < $b->getDegree()){
			$temp = $a;
			$a    = $b;
			$b    = $temp;
		}

		$rLast = $a;
		$r     = $b;
		$tLast = new GenericGFPoly([0]);
		$t     = new GenericGFPoly([1]);

		// Run Euclidean algorithm until r's degree is less than z/2
		while((2 * $r->getDegree()) >= $z){
			$rLastLast = $rLast;
			$tLastLast = $tLast;
			$rLast     = $r;
			$tLast     = $t;

			// Divide rLastLast by rLast, with quotient in q and remainder in r
			[$q, $r] = $rLastLast->divide($rLast);

			$t = $q->multiply($tLast)->addOrSubtract($tLastLast);

			if($r->getDegree() >= $rLast->getDegree()){
				throw new QRCodeDecoderException('Division algorithm failed to reduce polynomial?');
			}
		}

		$sigmaTildeAtZero = $t->getCoefficient(0);

		if($sigmaTildeAtZero === 0){
			throw new QRCodeDecoderException('sigmaTilde(0) was zero');
		}

		$inverse = GF256::inverse($sigmaTildeAtZero);

		return [$t->multiplyInt($inverse), $r->multiplyInt($inverse)];
	}

	/**
	 * @throws \chillerlan\QRCode\Decoder\QRCodeDecoderException
	 */
	private function findErrorLocations(GenericGFPoly $errorLocator):array{
		// This is a direct application of Chien's search
		$numErrors = $errorLocator->getDegree();

		if($numErrors === 1){ // shortcut
			return [$errorLocator->getCoefficient(1)];
		}

		$result = array_fill(0, $numErrors, 0);
		$e      = 0;

		for($i = 1; $i < 256 && $e < $numErrors; $i++){
			if($errorLocator->evaluateAt($i) === 0){
				$result[$e] = GF256::inverse($i);
				$e++;
			}
		}

		if($e !== $numErrors){
			throw new QRCodeDecoderException('Error locator degree does not match number of roots');
		}

		return $result;
	}

	/**
	 *
	 */
	private function findErrorMagnitudes(GenericGFPoly $errorEvaluator, array $errorLocations):array{
		// This is directly applying Forney's Formula
		$s      = count($errorLocations);
		$result = [];

		for($i = 0; $i < $s; $i++){
			$xiInverse   = GF256::inverse($errorLocations[$i]);
			$denominator = 1;

			for($j = 0; $j < $s; $j++){
				if($i !== $j){
#					$denominator = GF256::multiply($denominator, GF256::addOrSubtract(1, GF256::multiply($errorLocations[$j], $xiInverse)));
					// Above should work but fails on some Apple and Linux JDKs due to a Hotspot bug.
					// Below is a funny-looking workaround from Steven Parkes
					$term        = GF256::multiply($errorLocations[$j], $xiInverse);
					$denominator = GF256::multiply($denominator, ((($term & 0x1) === 0) ? ($term | 1) : ($term & ~1)));
				}
			}

			$result[$i] = GF256::multiply($errorEvaluator->evaluateAt($xiInverse), GF256::inverse($denominator));
		}

		return $result;
	}

}
