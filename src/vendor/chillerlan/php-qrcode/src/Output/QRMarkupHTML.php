<?php
/**
 * Class QRMarkupHTML
 *
 * @created      06.06.2022
 * @author       smiley <smiley@chillerlan.net>
 * @copyright    2022 smiley
 * @license      MIT
 */

namespace chillerlan\QRCode\Output;

use function implode, sprintf;

/**
 * HTML output (a cheap markup substitute when SVG is not available or not an option)
 */
class QRMarkupHTML extends QRMarkup{

	public const MIME_TYPE = 'text/html';

	/**
	 * @inheritDoc
	 */
	protected function createMarkup(bool $saveToFile):string{
		$rows     = [];
		$cssClass = $this->getCssClass();

		foreach($this->matrix->getMatrix() as $row){
			$element = '<span style="background: %s;"></span>';
			$modules = array_map(fn(int $M_TYPE):string => sprintf($element, $this->getModuleValue($M_TYPE)), $row);

			$rows[]  = sprintf('<div>%s</div>%s', implode('', $modules), $this->eol);
		}

		$html = sprintf('<div class="%1$s">%3$s%2$s</div>%3$s', $cssClass, implode('', $rows), $this->eol);

		// wrap the snippet into a body when saving to file
		if($saveToFile){
			$html = sprintf(
				'<!DOCTYPE html><html lang="none">%2$s<head>%2$s<meta charset="UTF-8">%2$s'.
					'<title>QR Code</title></head>%2$s<body>%1$s</body>%2$s</html>',
				$html,
				$this->eol
			);
		}

		return $html;
	}

}
