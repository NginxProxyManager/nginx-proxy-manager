<?php
/**
 * Class QRGdImageGIF
 *
 * @created      25.10.2023
 * @author       smiley <smiley@chillerlan.net>
 * @copyright    2023 smiley
 * @license      MIT
 *
 * @noinspection PhpComposerExtensionStubsInspection
 */

namespace chillerlan\QRCode\Output;

use function imagegif;

/**
 * GdImage gif output
 *
 * @see \imagegif()
 */
class QRGdImageGIF extends QRGdImage{

	public const MIME_TYPE = 'image/gif';

	/**
	 * @inheritDoc
	 */
	protected function renderImage():void{
		imagegif($this->image);
	}

}
