<?php
/**
 * Class QRImagick
 *
 * @created      04.07.2018
 * @author       smiley <smiley@chillerlan.net>
 * @copyright    2018 smiley
 * @license      MIT
 *
 * @noinspection PhpComposerExtensionStubsInspection
 */

namespace chillerlan\QRCode\Output;

use chillerlan\QRCode\Data\QRMatrix;
use chillerlan\Settings\SettingsContainerInterface;
use finfo, Imagick, ImagickDraw, ImagickPixel;
use function extension_loaded, in_array, is_string, max, min, preg_match, strlen;
use const FILEINFO_MIME_TYPE;

/**
 * ImageMagick output module (requires ext-imagick)
 *
 * @see https://php.net/manual/book.imagick.php
 * @see https://phpimagick.com
 */
class QRImagick extends QROutputAbstract{

	/**
	 * The main image instance
	 */
	protected Imagick $imagick;

	/**
	 * The main draw instance
	 */
	protected ImagickDraw $imagickDraw;

	/**
	 * The allocated background color
	 */
	protected ImagickPixel $backgroundColor;

	/**
	 * @inheritDoc
	 *
	 * @throws \chillerlan\QRCode\Output\QRCodeOutputException
	 */
	public function __construct(SettingsContainerInterface $options, QRMatrix $matrix){

		foreach(['fileinfo', 'imagick'] as $ext){
			if(!extension_loaded($ext)){
				throw new QRCodeOutputException(sprintf('ext-%s not loaded', $ext)); // @codeCoverageIgnore
			}
		}

		parent::__construct($options, $matrix);
	}

	/**
	 * note: we're not necessarily validating the several values, just checking the general syntax
	 *
	 * @see https://www.php.net/manual/imagickpixel.construct.php
	 * @inheritDoc
	 */
	public static function moduleValueIsValid($value):bool{

		if(!is_string($value)){
			return false;
		}

		$value = trim($value);

		// hex notation
		// #rgb(a)
		// #rrggbb(aa)
		// #rrrrggggbbbb(aaaa)
		// ...
		if(preg_match('/^#[a-f\d]+$/i', $value) && in_array((strlen($value) - 1), [3, 4, 6, 8, 9, 12, 16, 24, 32], true)){
			return true;
		}

		// css (-like) func(...values)
		if(preg_match('#^(graya?|hs(b|la?)|rgba?)\([\d .,%]+\)$#i', $value)){
			return true;
		}

		// predefined css color
		if(preg_match('/^[a-z]+$/i', $value)){
			return true;
		}

		return false;
	}

	/**
	 * @inheritDoc
	 */
	protected function prepareModuleValue($value):ImagickPixel{
		return new ImagickPixel($value);
	}

	/**
	 * @inheritDoc
	 */
	protected function getDefaultModuleValue(bool $isDark):ImagickPixel{
		return $this->prepareModuleValue(($isDark) ? '#000' : '#fff');
	}

	/**
	 * @inheritDoc
	 *
	 * @return string|\Imagick
	 */
	public function dump(string $file = null){
		$this->setBgColor();

		$this->imagick = $this->createImage();

		$this->drawImage();
		// set transparency color after all operations
		$this->setTransparencyColor();

		if($this->options->returnResource){
			return $this->imagick;
		}

		$imageData = $this->imagick->getImageBlob();

		$this->imagick->destroy();

		$this->saveToFile($imageData, $file);

		if($this->options->outputBase64){
			$imageData = $this->toBase64DataURI($imageData, (new finfo(FILEINFO_MIME_TYPE))->buffer($imageData));
		}

		return $imageData;
	}

	/**
	 * Sets the background color
	 */
	protected function setBgColor():void{

		if($this::moduleValueIsValid($this->options->bgColor)){
			$this->backgroundColor = $this->prepareModuleValue($this->options->bgColor);

			return;
		}

		$this->backgroundColor = $this->prepareModuleValue('white');
	}

	/**
	 * Creates a new Imagick instance
	 */
	protected function createImage():Imagick{
		$imagick          = new Imagick;
		[$width, $height] = $this->getOutputDimensions();

		$imagick->newImage($width, $height, $this->backgroundColor, $this->options->imagickFormat);

		if($this->options->quality > -1){
			$imagick->setImageCompressionQuality(max(0, min(100, $this->options->quality)));
		}

		return $imagick;
	}

	/**
	 * Sets the transparency color
	 */
	protected function setTransparencyColor():void{

		if(!$this->options->imageTransparent){
			return;
		}

		$transparencyColor = $this->backgroundColor;

		if($this::moduleValueIsValid($this->options->transparencyColor)){
			$transparencyColor = $this->prepareModuleValue($this->options->transparencyColor);
		}

		$this->imagick->transparentPaintImage($transparencyColor, 0.0, 10, false);
	}

	/**
	 * Creates the QR image via ImagickDraw
	 */
	protected function drawImage():void{
		$this->imagickDraw = new ImagickDraw;
		$this->imagickDraw->setStrokeWidth(0);

		foreach($this->matrix->getMatrix() as $y => $row){
			foreach($row as $x => $M_TYPE){
				$this->module($x, $y, $M_TYPE);
			}
		}

		$this->imagick->drawImage($this->imagickDraw);
	}

	/**
	 * draws a single pixel at the given position
	 */
	protected function module(int $x, int $y, int $M_TYPE):void{

		if(!$this->drawLightModules && !$this->matrix->isDark($M_TYPE)){
			return;
		}

		$this->imagickDraw->setFillColor($this->getModuleValue($M_TYPE));

		if($this->drawCircularModules && !$this->matrix->checkTypeIn($x, $y, $this->keepAsSquare)){
			$this->imagickDraw->circle(
				(($x + 0.5) * $this->scale),
				(($y + 0.5) * $this->scale),
				(($x + 0.5 + $this->circleRadius) * $this->scale),
				(($y + 0.5) * $this->scale)
			);

			return;
		}

		$this->imagickDraw->rectangle(
			($x * $this->scale),
			($y * $this->scale),
			((($x + 1) * $this->scale) - 1),
			((($y + 1) * $this->scale) - 1)
		);
	}

}
