const path                 = require('path');
const webpack              = require('webpack');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const Visualizer           = require('webpack-visualizer-plugin');
const CopyWebpackPlugin    = require('copy-webpack-plugin');
const HtmlWebpackPlugin    = require('html-webpack-plugin');
const PACKAGE              = require('./package.json');

module.exports = {
	entry:     {
		main:  './js/index.js',
		login: './js/login.js'
	},
	output:    {
		path:          path.resolve(__dirname, 'dist'),
		filename:      'js/[name].bundle.js',
		chunkFilename: 'js/[name].bundle.[id].js',
		publicPath:    '/'
	},
	resolve:   {
		alias: {
			'tabler-core':      'tabler-ui/dist/assets/js/core',
			'bootstrap':        'tabler-ui/dist/assets/js/vendors/bootstrap.bundle.min',
			'sparkline':        'tabler-ui/dist/assets/js/vendors/jquery.sparkline.min',
			'selectize':        'tabler-ui/dist/assets/js/vendors/selectize.min',
			'tablesorter':      'tabler-ui/dist/assets/js/vendors/jquery.tablesorter.min',
			'vector-map':       'tabler-ui/dist/assets/js/vendors/jquery-jvectormap-2.0.3.min',
			'vector-map-de':    'tabler-ui/dist/assets/js/vendors/jquery-jvectormap-de-merc',
			'vector-map-world': 'tabler-ui/dist/assets/js/vendors/jquery-jvectormap-world-mill',
			'circle-progress':  'tabler-ui/dist/assets/js/vendors/circle-progress.min',
			'c3':               'tabler-ui/dist/assets/js/vendors/chart.bundle.min'
		}
	},
	module:    {
		rules: [
			// Shims for tabler-ui
			{
				test:   /assets\/js\/core/,
				loader: 'imports-loader?bootstrap'
			},
			{
				test:   /jquery-jvectormap-de-merc/,
				loader: 'imports-loader?vector-map'
			},
			{
				test:   /jquery-jvectormap-world-mill/,
				loader: 'imports-loader?vector-map'
			},

			// other:
			{
				type:    'javascript/auto', // <= Set the module.type explicitly
				test:    /\bmessages\.json$/,
				loader:  'messageformat-loader',
				options: {
					biDiSupport:            false,
					disablePluralKeyChecks: false,
					formatters:             null,
					intlSupport:            false,
					locale:                 ['en'],
					strictNumberSign:       false
				}
			},
			{
				test:    /\.js$/,
				exclude: /node_modules/,
				use:     {
					loader: 'babel-loader'
				}
			},
			{
				test:   /\.ejs$/,
				loader: 'ejs-loader'
			},
			{
				test: /\.scss$/,
				use:  [
					MiniCssExtractPlugin.loader,
					'css-loader',
					'sass-loader'
				]
			},
			{
				test: /.*tabler.*\.(jpe?g|gif|png|svg|eot|woff|ttf)$/,
				use:  [
					{
						loader:  'file-loader',
						options: {
							outputPath: 'assets/tabler-ui/'
						}
					}
				]
			}
		]
	},
	plugins:   [
		new webpack.ProvidePlugin({
			$:      'jquery',
			jQuery: 'jquery',
			_:      'underscore'
		}),
		new HtmlWebpackPlugin({
			template:           '!!ejs-webpack-loader!html/index.ejs',
			filename:           'index.html',
			inject:             false,
			templateParameters: {
				version: PACKAGE.version
			}
		}),
		new HtmlWebpackPlugin({
			template:           '!!ejs-webpack-loader!html/login.ejs',
			filename:           'login.html',
			inject:             false,
			templateParameters: {
				version: PACKAGE.version
			}
		}),
		new MiniCssExtractPlugin({
			filename:      'css/[name].css',
			chunkFilename: 'css/[id].css'
		}),
		new Visualizer({
			filename: '../webpack_stats.html'
		}),
		new CopyWebpackPlugin([{
			from:    'app-images',
			to:      'images',
			toType:  'dir',
			context: '/app/frontend'
		}])
	]
};
