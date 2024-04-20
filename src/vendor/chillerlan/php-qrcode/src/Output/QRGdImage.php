<?php
/**
 * Class QRGdImage
 *
 * @created      05.12.2015
 * @author       Smiley <smiley@chillerlan.net>
 * @copyright    2015 Smiley
 * @license      MIT
 *
 * @noinspection PhpComposerExtensionStubsInspection
 */

namespace chillerlan\QRCode\Output;

use chillerlan\QRCode\Data\QRMatrix;
use chillerlan\Settings\SettingsContainerInterface;
use ErrorException;
use Throwable;
use function array_values, count, extension_loaded, imagebmp, imagecolorallocate, imagecolortransparent,
	imagecreatetruecolor, imagedestroy, imagefilledellipse, imagefilledrectangle, imagegif, imagejpeg, imagepng,
	imagescale, imagetypes, imagewebp, intdiv, intval, is_array, is_numeric, max, min, ob_end_clean, ob_get_contents, ob_start,
	restore_error_handler, set_error_handler, sprintf;
use const IMG_BMP, IMG_GIF, IMG_JPG, IMG_PNG, IMG_WEBP;

/**
 * Converts the matrix into GD images, raw or base64 output (requires ext-gd)
 *
 * @see https://php.net/manual/book.image.php
 *
 * @deprecated 5.0.0 this class will be made abstract in future versions,
 *                   calling it directly is deprecated - use one of the child classes instead
 * @see https://github.com/chillerlan/php-qrcode/issues/223
 */
class QRGdImage extends QROutputAbstract{

	/**
	 * The GD image resource
	 *
	 * @see imagecreatetruecolor()
	 * @var resource|\GdImage
	 *
	 * @todo: add \GdImage type in v6
	 */
	protected $image;

	/**
	 * The allocated background color
	 *
	 * @see \imagecolorallocate()
	 */
	protected int $background;

	/**
	 * Whether we're running in upscale mode (scale < 20)
	 *
	 * @see \chillerlan\QRCode\QROptions::$drawCircularModules
	 */
	protected bool $upscaled = false;

	/**
	 * @inheritDoc
	 *
	 * @throws \chillerlan\QRCode\Output\QRCodeOutputException
	 * @noinspection PhpMissingParentConstructorInspection
	 */
	public function __construct(SettingsContainerInterface $options, QRMatrix $matrix){
		$this->options = $options;
		$this->matrix  = $matrix;

		$this->checkGD();

		if($this->options->invertMatrix){
			$this->matrix->invert();
		}

		$this->copyVars();
		$this->setMatrixDimensions();
	}

	/**
	 * Checks whether GD is installed and if the given mode is supported
	 *
	 * @return void
	 * @throws \chillerlan\QRCode\Output\QRCodeOutputException
	 * @codeCoverageIgnore
	 */
	protected function checkGD():void{

		if(!extension_loaded('gd')){
			throw new QRCodeOutputException('ext-gd not loaded');
		}

		$modes = [
			self::GDIMAGE_BMP  => IMG_BMP,
			self::GDIMAGE_GIF  => IMG_GIF,
			self::GDIMAGE_JPG  => IMG_JPG,
			self::GDIMAGE_PNG  => IMG_PNG,
			self::GDIMAGE_WEBP => IMG_WEBP,
		];

		// likely using default or custom output
		if(!isset($modes[$this->options->outputType])){
			return;
		}

		$mode = $modes[$this->options->outputType];

		if((imagetypes() & $mode) !== $mode){
			throw new QRCodeOutputException(sprintf('output mode "%s" not supported', $this->options->outputType));
		}

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
	protected function prepareModuleValue($value):int{
		$values = [];

		foreach(array_values($value) as $i => $val){

			if($i > 2){
				break;
			}

			$values[] = max(0, min(255, intval($val)));
		}

		/** @phan-suppress-next-line PhanParamTooFewInternalUnpack */
		$color = imagecolorallocate($this->image, ...$values);

		if($color === false){
			throw new QRCodeOutputException('could not set color: imagecolorallocate() error');
		}

		return $color;
	}

	/**
	 * @inheritDoc
	 */
	protected function getDefaultModuleValue(bool $isDark):int{
		return $this->prepareModuleValue(($isDark) ? [0, 0, 0] : [255, 255, 255]);
	}

	/**
	 * @inheritDoc
	 *
	 * @return string|resource|\GdImage
	 *
	 * @phan-suppress PhanUndeclaredTypeReturnType, PhanTypeMismatchReturn
	 * @throws \ErrorException
	 */
	public function dump(string $file = null){

		set_error_handler(function(int $errno, string $errstr):bool{
			throw new ErrorException($errstr, $errno);
		});

		$this->image = $this->createImage();
		// set module values after image creation because we need the GdImage instance
		$this->setModuleValues();
		$this->setBgColor();

		imagefilledrectangle($this->image, 0, 0, $this->length, $this->length, $this->background);

		$this->drawImage();

		if($this->upscaled){
			// scale down to the expected size
			$this->image    = imagescale($this->image, ($this->length / 10), ($this->length / 10));
			$this->upscaled = false;
		}

		// set transparency after scaling, otherwise it would be undone
		// @see https://www.php.net/manual/en/function.imagecolortransparent.php#77099
		$this->setTransparencyColor();

		if($this->options->returnResource){
			restore_error_handler();

			return $this->image;
		}

		$imageData = $this->dumpImage();

		$this->saveToFile($imageData, $file);

		if($this->options->outputBase64){
			// @todo: remove mime parameter in v6
			$imageData = $this->toBase64DataURI($imageData, 'image/'.$this->options->outputType);
		}

		restore_error_handler();

		return $imageData;
	}

	/**
	 * Creates a new GdImage resource and scales it if necessary
	 *
	 * we're scaling the image up in order to draw crisp round circles, otherwise they appear square-y on small scales
	 *
	 * @see https://github.com/chillerlan/php-qrcode/issues/23
	 *
	 * @return \GdImage|resource
	 */
	protected function createImage(){

		if($this->drawCircularModules && $this->options->gdImageUseUpscale && $this->options->scale < 20){
			// increase the initial image size by 10
			$this->length   *= 10;
			$this->scale    *= 10;
			$this->upscaled  = true;
		}

		return imagecreatetruecolor($this->length, $this->length);
	}

	/**
	 * Sets the background color
	 */
	protected function setBgColor():void{

		if(isset($this->background)){
			return;
		}

		if($this::moduleValueIsValid($this->options->bgColor)){
			$this->background = $this->prepareModuleValue($this->options->bgColor);

			return;
		}

		$this->background = $this->prepareModuleValue([255, 255, 255]);
	}

	/**
	 * Sets the transparency color
	 */
	protected function setTransparencyColor():void{

		// @todo: the jpg skip can be removed in v6
		if($this->options->outputType === QROutputInterface::GDIMAGE_JPG || !$this->options->imageTransparent){
			return;
		}

		$transparencyColor = $this->background;

		if($this::moduleValueIsValid($this->options->transparencyColor)){
			$transparencyColor = $this->prepareModuleValue($this->options->transparencyColor);
		}

		imagecolortransparent($this->image, $transparencyColor);
	}

	/**
	 * Draws the QR image
	 */
	protected function drawImage():void{
		foreach($this->matrix->getMatrix() as $y => $row){
			foreach($row as $x => $M_TYPE){
				$this->module($x, $y, $M_TYPE);
			}
		}
	}

	/**
	 * Creates a single QR pixel with the given settings
	 */
	protected function module(int $x, int $y, int $M_TYPE):void{

		if(!$this->drawLightModules && !$this->matrix->isDark($M_TYPE)){
			return;
		}

		$color = $this->getModuleValue($M_TYPE);

		if($this->drawCircularModules && !$this->matrix->checkTypeIn($x, $y, $this->keepAsSquare)){
			imagefilledellipse(
				$this->image,
				(($x * $this->scale) + intdiv($this->scale, 2)),
				(($y * $this->scale) + intdiv($this->scale, 2)),
				(int)($this->circleDiameter * $this->scale),
				(int)($this->circleDiameter * $this->scale),
				$color
			);

			return;
		}

		imagefilledrectangle(
			$this->image,
			($x * $this->scale),
			($y * $this->scale),
			(($x + 1) * $this->scale),
			(($y + 1) * $this->scale),
			$color
		);
	}

	/**
	 * Renders the image with the gdimage function for the desired output
	 *
	 * @see \imagebmp()
	 * @see \imagegif()
	 * @see \imagejpeg()
	 * @see \imagepng()
	 * @see \imagewebp()
	 *
	 * @todo: v6.0: make abstract and call from child classes
	 * @see https://github.com/chillerlan/php-qrcode/issues/223
	 * @codeCoverageIgnore
	 */
	protected function renderImage():void{

		switch($this->options->outputType){
			case QROutputInterface::GDIMAGE_BMP:
				imagebmp($this->image, null, ($this->options->quality > 0));
				break;
			case QROutputInterface::GDIMAGE_GIF:
				imagegif($this->image);
				break;
			case QROutputInterface::GDIMAGE_JPG:
				imagejpeg($this->image, null, max(-1, min(100, $this->options->quality)));
				break;
			case QROutputInterface::GDIMAGE_WEBP:
				imagewebp($this->image, null, max(-1, min(100, $this->options->quality)));
				break;
			// silently default to png output
			case QROutputInterface::GDIMAGE_PNG:
			default:
				imagepng($this->image, null, max(-1, min(9, $this->options->quality)));
		}

	}

	/**
	 * Creates the final image by calling the desired GD output function
	 *
	 * @throws \chillerlan\QRCode\Output\QRCodeOutputException
	 */
	protected function dumpImage():string{
		$exception = null;
		$imageData = null;

		ob_start();

		try{
			$this->renderImage();

			$imageData = ob_get_contents();
			imagedestroy($this->image);
		}
		// not going to cover edge cases
		// @codeCoverageIgnoreStart
		catch(Throwable $e){
			$exception = $e;
		}
		// @codeCoverageIgnoreEnd

		ob_end_clean();

		// throw here in case an exception happened within the output buffer
		if($exception instanceof Throwable){
			throw new QRCodeOutputException($exception->getMessage());
		}

		return $imageData;
	}

}
