<?php
/**
 * Class QRFpdf
 *
 * @created      03.06.2020
 * @author       Maximilian Kresse
 * @license      MIT
 *
 * @see https://github.com/chillerlan/php-qrcode/pull/49
 */

namespace chillerlan\QRCode\Output;

use chillerlan\QRCode\Data\QRMatrix;
use chillerlan\Settings\SettingsContainerInterface;
use FPDF;

use function array_values, class_exists, count, intval, is_array, is_numeric, max, min;

/**
 * QRFpdf output module (requires fpdf)
 *
 * @see https://github.com/Setasign/FPDF
 * @see http://www.fpdf.org/
 */
class QRFpdf extends QROutputAbstract{

	public const MIME_TYPE = 'application/pdf';

	protected FPDF   $fpdf;
	protected ?array $prevColor = null;

	/**
	 * QRFpdf constructor.
	 *
	 * @throws \chillerlan\QRCode\Output\QRCodeOutputException
	 */
	public function __construct(SettingsContainerInterface $options, QRMatrix $matrix){

		if(!class_exists(FPDF::class)){
			// @codeCoverageIgnoreStart
			throw new QRCodeOutputException(
				'The QRFpdf output requires FPDF (https://github.com/Setasign/FPDF)'.
				' as dependency but the class "\\FPDF" couldn\'t be found.'
			);
			// @codeCoverageIgnoreEnd
		}

		parent::__construct($options, $matrix);
	}

	/**
	 * @inheritDoc
	 */
	public static function moduleValueIsValid($value):bool{

		if(!is_array($value) || count($value) < 3){
			return false;
		}

		// check the first 3 values of the array
		foreach(array_values($value) as $i => $val){

			if($i > 2){
				break;
			}

			if(!is_numeric($val)){
				return false;
			}

		}

		return true;
	}

	/**
	 * @param array $value
	 *
	 * @inheritDoc
	 * @throws \chillerlan\QRCode\Output\QRCodeOutputException
	 */
	protected function prepareModuleValue($value):array{
		$values = [];

		foreach(array_values($value) as $i => $val){

			if($i > 2){
				break;
			}

			$values[] = max(0, min(255, intval($val)));
		}

		if(count($values) !== 3){
			throw new QRCodeOutputException('invalid color value');
		}

		return $values;
	}

	/**
	 * @inheritDoc
	 */
	protected function getDefaultModuleValue(bool $isDark):array{
		return ($isDark) ? [0, 0, 0] : [255, 255, 255];
	}

	/**
	 * Initializes an FPDF instance
	 */
	protected function initFPDF():FPDF{
		return new FPDF('P', $this->options->fpdfMeasureUnit, $this->getOutputDimensions());
	}

	/**
	 * @inheritDoc
	 *
	 * @return string|\FPDF
	 */
	public function dump(string $file = null){
		$this->fpdf = $this->initFPDF();
		$this->fpdf->AddPage();

		if($this::moduleValueIsValid($this->options->bgColor)){
			$bgColor          = $this->prepareModuleValue($this->options->bgColor);
			[$width, $height] = $this->getOutputDimensions();

			/** @phan-suppress-next-line PhanParamTooFewUnpack */
			$this->fpdf->SetFillColor(...$bgColor);
			$this->fpdf->Rect(0, 0, $width, $height, 'F');
		}

		$this->prevColor = null;

		foreach($this->matrix->getMatrix() as $y => $row){
			foreach($row as $x => $M_TYPE){
				$this->module($x, $y, $M_TYPE);
			}
		}

		if($this->options->returnResource){
			return $this->fpdf;
		}

		$pdfData = $this->fpdf->Output('S');

		$this->saveToFile($pdfData, $file);

		if($this->options->outputBase64){
			$pdfData = $this->toBase64DataURI($pdfData);
		}

		return $pdfData;
	}

	/**
	 * Renders a single module
	 */
	protected function module(int $x, int $y, int $M_TYPE):void{

		if(!$this->drawLightModules && !$this->matrix->isDark($M_TYPE)){
			return;
		}

		$color = $this->getModuleValue($M_TYPE);

		if($color !== null && $color !== $this->prevColor){
			/** @phan-suppress-next-line PhanParamTooFewUnpack */
			$this->fpdf->SetFillColor(...$color);
			$this->prevColor = $color;
		}

		$this->fpdf->Rect(($x * $this->scale), ($y * $this->scale), $this->scale, $this->scale, 'F');
	}

}
