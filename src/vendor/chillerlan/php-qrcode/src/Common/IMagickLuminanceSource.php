<?php
/**
 * Class IMagickLuminanceSource
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

use chillerlan\Settings\SettingsContainerInterface;
use Imagick;
use function count;

/**
 * This class is used to help decode images from files which arrive as Imagick Resource
 * It does not support rotation.
 */
class IMagickLuminanceSource extends LuminanceSourceAbstract{

	protected Imagick $imagick;

	/**
	 * IMagickLuminanceSource constructor.
	 */
	public function __construct(Imagick $imagick, SettingsContainerInterface $options = null){
		parent::__construct($imagick->getImageWidth(), $imagick->getImageHeight(), $options);

		$this->imagick = $imagick;

		if($this->options->readerGrayscale){
			$this->imagick->setImageColorspace(Imagick::COLORSPACE_GRAY);
		}

		if($this->options->readerInvertColors){
			$this->imagick->negateImage($this->options->readerGrayscale);
		}

		if($this->options->readerIncreaseContrast){
			for($i = 0; $i < 10; $i++){
				$this->imagick->contrastImage(false); // misleading docs
			}
		}

		$this->setLuminancePixels();
	}

	/**
	 *
	 */
	protected function setLuminancePixels():void{
		$pixels = $this->imagick->exportImagePixels(1, 1, $this->width, $this->height, 'RGB', Imagick::PIXEL_CHAR);
		$count  = count($pixels);

		for($i = 0; $i < $count; $i += 3){
			$this->setLuminancePixel(($pixels[$i] & 0xff), ($pixels[($i + 1)] & 0xff), ($pixels[($i + 2)] & 0xff));
		}
	}

	/** @inheritDoc */
	public static function fromFile(string $path, SettingsContainerInterface $options = null):self{
		return new self(new Imagick(self::checkFile($path)), $options);
	}

	/** @inheritDoc */
	public static function fromBlob(string $blob, SettingsContainerInterface $options = null):self{
		$im = new Imagick;
		$im->readImageBlob($blob);

		return new self($im, $options);
	}

}
