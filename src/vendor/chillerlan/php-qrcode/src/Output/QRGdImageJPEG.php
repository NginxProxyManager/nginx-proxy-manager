<?php
/**
 * Class QRGdImageJPEG
 *
 * @created      25.10.2023
 * @author       smiley <smiley@chillerlan.net>
 * @copyright    2023 smiley
 * @license      MIT
 *
 * @noinspection PhpComposerExtensionStubsInspection
 */

namespace chillerlan\QRCode\Output;

use function imagejpeg, max, min;

/**
 * GdImage jpeg output
 *
 * @see \imagejpeg()
 */
class QRGdImageJPEG extends QRGdImage{

	public const MIME_TYPE = 'image/jpg';

	/**
	 * @inheritDoc
	 */
	protected function setTransparencyColor():void{
		// noop - transparency is not supported
	}

	/**
	 * @inheritDoc
	 */
	protected function renderImage():void{
		imagejpeg($this->image, null, max(-1, min(100, $this->options->quality)));
	}

}
