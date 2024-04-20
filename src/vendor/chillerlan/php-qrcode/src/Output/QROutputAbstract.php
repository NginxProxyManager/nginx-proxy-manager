<?php
/**
 * Class QROutputAbstract
 *
 * @created      09.12.2015
 * @author       Smiley <smiley@chillerlan.net>
 * @copyright    2015 Smiley
 * @license      MIT
 */

namespace chillerlan\QRCode\Output;

use chillerlan\QRCode\Data\QRMatrix;
use chillerlan\Settings\SettingsContainerInterface;
use Closure;
use function base64_encode, dirname, file_put_contents, is_writable, ksort, sprintf;

/**
 * common output abstract
 */
abstract class QROutputAbstract implements QROutputInterface{

	/**
	 * the current size of the QR matrix
	 *
	 * @see \chillerlan\QRCode\Data\QRMatrix::getSize()
	 */
	protected int $moduleCount;

	/**
	 * the side length of the QR image (modules * scale)
	 */
	protected int $length;

	/**
	 * an (optional) array of color values for the several QR matrix parts
	 */
	protected array $moduleValues;

	/**
	 * the (filled) data matrix object
	 */
	protected QRMatrix $matrix;

	/**
	 * @var \chillerlan\Settings\SettingsContainerInterface|\chillerlan\QRCode\QROptions
	 */
	protected SettingsContainerInterface $options;

	/** @see \chillerlan\QRCode\QROptions::$scale */
	protected int $scale;
	/** @see \chillerlan\QRCode\QROptions::$connectPaths */
	protected bool $connectPaths;
	/** @see \chillerlan\QRCode\QROptions::$excludeFromConnect */
	protected array $excludeFromConnect;
	/** @see \chillerlan\QRCode\QROptions::$eol */
	protected string $eol;
	/** @see \chillerlan\QRCode\QROptions::$drawLightModules */
	protected bool $drawLightModules;
	/** @see \chillerlan\QRCode\QROptions::$drawCircularModules */
	protected bool $drawCircularModules;
	/** @see \chillerlan\QRCode\QROptions::$keepAsSquare */
	protected array $keepAsSquare;
	/** @see \chillerlan\QRCode\QROptions::$circleRadius */
	protected float $circleRadius;
	protected float $circleDiameter;

	/**
	 * QROutputAbstract constructor.
	 */
	public function __construct(SettingsContainerInterface $options, QRMatrix $matrix){
		$this->options = $options;
		$this->matrix  = $matrix;

		if($this->options->invertMatrix){
			$this->matrix->invert();
		}

		$this->copyVars();
		$this->setMatrixDimensions();
		$this->setModuleValues();
	}

	/**
	 * Creates copies of several QROptions values to avoid calling the magic getters
	 * in long loops for a significant performance increase.
	 *
	 * These variables are usually used in the "module" methods and are called up to 31329 times (at version 40).
	 */
	protected function copyVars():void{

		$vars = [
			'connectPaths',
			'excludeFromConnect',
			'eol',
			'drawLightModules',
			'drawCircularModules',
			'keepAsSquare',
			'circleRadius',
		];

		foreach($vars as $property){
			$this->{$property} = $this->options->{$property};
		}

		$this->circleDiameter = ($this->circleRadius * 2);
	}

	/**
	 * Sets/updates the matrix dimensions
	 *
	 * Call this method if you modify the matrix from within your custom module in case the dimensions have been changed
	 */
	protected function setMatrixDimensions():void{
		$this->moduleCount = $this->matrix->getSize();
		$this->scale       = $this->options->scale;
		$this->length      = ($this->moduleCount * $this->scale);
	}

	/**
	 * Returns a 2 element array with the current output width and height
	 *
	 * The type and units of the values depend on the output class. The default value is the current module count * scale.
	 */
	protected function getOutputDimensions():array{
		return [$this->length, $this->length];
	}

	/**
	 * Sets the initial module values
	 */
	protected function setModuleValues():void{

		// first fill the map with the default values
		foreach($this::DEFAULT_MODULE_VALUES as $M_TYPE => $defaultValue){
			$this->moduleValues[$M_TYPE] = $this->getDefaultModuleValue($defaultValue);
		}

		// now loop over the options values to replace defaults and add extra values
		foreach($this->options->moduleValues as $M_TYPE => $value){
			if($this::moduleValueIsValid($value)){
				$this->moduleValues[$M_TYPE] = $this->prepareModuleValue($value);
			}
		}

	}

	/**
	 * Prepares the value for the given input (return value depends on the output class)
	 *
	 * @param mixed $value
	 *
	 * @return mixed|null
	 */
	abstract protected function prepareModuleValue($value);

	/**
	 * Returns a default value for either dark or light modules (return value depends on the output class)
	 *
	 * @return mixed|null
	 */
	abstract protected function getDefaultModuleValue(bool $isDark);

	/**
	 * Returns the prepared value for the given $M_TYPE
	 *
	 * @return mixed return value depends on the output class
	 * @throws \chillerlan\QRCode\Output\QRCodeOutputException if $moduleValues[$M_TYPE] doesn't exist
	 */
	protected function getModuleValue(int $M_TYPE){

		if(!isset($this->moduleValues[$M_TYPE])){
			throw new QRCodeOutputException(sprintf('$M_TYPE %012b not found in module values map', $M_TYPE));
		}

		return $this->moduleValues[$M_TYPE];
	}

	/**
	 * Returns the prepared module value at the given coordinate [$x, $y] (convenience)
	 *
	 * @return mixed|null
	 */
	protected function getModuleValueAt(int $x, int $y){
		return $this->getModuleValue($this->matrix->get($x, $y));
	}

	/**
	 * Returns a base64 data URI for the given string and mime type
	 */
	protected function toBase64DataURI(string $data, string $mime = null):string{
		return sprintf('data:%s;base64,%s', ($mime ?? $this::MIME_TYPE), base64_encode($data));
	}

	/**
	 * Saves the qr $data to a $file. If $file is null, nothing happens.
	 *
	 * @see file_put_contents()
	 * @see \chillerlan\QRCode\QROptions::$cachefile
	 *
	 * @throws \chillerlan\QRCode\Output\QRCodeOutputException
	 */
	protected function saveToFile(string $data, string $file = null):void{

		if($file === null){
			return;
		}

		if(!is_writable(dirname($file))){
			throw new QRCodeOutputException(sprintf('Cannot write data to cache file: %s', $file));
		}

		if(file_put_contents($file, $data) === false){
			throw new QRCodeOutputException(sprintf('Cannot write data to cache file: %s (file_put_contents error)', $file));
		}
	}

	/**
	 * collects the modules per QRMatrix::M_* type and runs a $transform function on each module and
	 * returns an array with the transformed modules
	 *
	 * The transform callback is called with the following parameters:
	 *
	 *   $x            - current column
	 *   $y            - current row
	 *   $M_TYPE       - field value
	 *   $M_TYPE_LAYER - (possibly modified) field value that acts as layer id
	 */
	protected function collectModules(Closure $transform):array{
		$paths = [];

		// collect the modules for each type
		foreach($this->matrix->getMatrix() as $y => $row){
			foreach($row as $x => $M_TYPE){
				$M_TYPE_LAYER = $M_TYPE;

				if($this->connectPaths && !$this->matrix->checkTypeIn($x, $y, $this->excludeFromConnect)){
					// to connect paths we'll redeclare the $M_TYPE_LAYER to data only
					$M_TYPE_LAYER = QRMatrix::M_DATA;

					if($this->matrix->isDark($M_TYPE)){
						$M_TYPE_LAYER = QRMatrix::M_DATA_DARK;
					}
				}

				// collect the modules per $M_TYPE
				$module = $transform($x, $y, $M_TYPE, $M_TYPE_LAYER);

				if(!empty($module)){
					$paths[$M_TYPE_LAYER][] = $module;
				}
			}
		}

		// beautify output
		ksort($paths);

		return $paths;
	}

}
