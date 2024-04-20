<?php
/**
 * Class GDLuminanceSource
 *
 * @created      17.01.2021
 * @author       Ashot Khanamiryan
 * @author       Smiley <smiley@chillerlan.net>
 * @copyright    2021 Smiley
 * @license      MIT
 *
 * @noinspection PhpComposerExtensionStubsInspection
 */

namespace chillerlan\QRCode\Common;

use chillerlan\QRCode\Decoder\QRCodeDecoderException;
use chillerlan\Settings\SettingsContainerInterface;
use function file_get_contents, get_resource_type, imagecolorat, imagecolorsforindex,
	imagecreatefromstring, imagefilter, imagesx, imagesy, is_resource;
use const IMG_FILTER_BRIGHTNESS, IMG_FILTER_CONTRAST, IMG_FILTER_GRAYSCALE, IMG_FILTER_NEGATE, PHP_MAJOR_VERSION;

/**
 * This class is used to help decode images from files which arrive as GD Resource
 * It does not support rotation.
 */
class GDLuminanceSource extends LuminanceSourceAbstract{

	/**
	 * @var resource|\GdImage
	 */
	protected $gdImage;

	/**
	 * GDLuminanceSource constructor.
	 *
	 * @param resource|\GdImage                                    $gdImage
	 * @param \chillerlan\Settings\SettingsContainerInterface|null $options
	 *
	 * @throws \chillerlan\QRCode\Decoder\QRCodeDecoderException
	 */
	public function __construct($gdImage, SettingsContainerInterface $options = null){

		/** @noinspection PhpFullyQualifiedNameUsageInspection */
		if(
			(PHP_MAJOR_VERSION >= 8 && !$gdImage instanceof \GdImage) // @todo: remove version check in v6
			|| (PHP_MAJOR_VERSION < 8 && (!is_resource($gdImage) || get_resource_type($gdImage) !== 'gd'))
		){
			throw new QRCodeDecoderException('Invalid GD image source.'); // @codeCoverageIgnore
		}

		parent::__construct(imagesx($gdImage), imagesy($gdImage), $options);

		$this->gdImage = $gdImage;

		if($this->options->readerGrayscale){
			imagefilter($this->gdImage,  IMG_FILTER_GRAYSCALE);
		}

		if($this->options->readerInvertColors){
			imagefilter($this->gdImage, IMG_FILTER_NEGATE);
		}

		if($this->options->readerIncreaseContrast){
			imagefilter($this->gdImage, IMG_FILTER_BRIGHTNESS, -100);
			imagefilter($this->gdImage, IMG_FILTER_CONTRAST, -100);
		}

		$this->setLuminancePixels();
	}

	/**
	 *
	 */
	protected function setLuminancePixels():void{

		for($j = 0; $j < $this->height; $j++){
			for($i = 0; $i < $this->width; $i++){
				$argb  = imagecolorat($this->gdImage, $i, $j);
				$pixel = imagecolorsforindex($this->gdImage, $argb);

				$this->setLuminancePixel($pixel['red'], $pixel['green'], $pixel['blue']);
			}
		}

	}

	/** @inheritDoc */
	public static function fromFile(string $path, SettingsContainerInterface $options = null):self{
		return new self(imagecreatefromstring(file_get_contents(self::checkFile($path))), $options);
	}

	/** @inheritDoc */
	public static function fromBlob(string $blob, SettingsContainerInterface $options = null):self{
		return new self(imagecreatefromstring($blob), $options);
	}

}
