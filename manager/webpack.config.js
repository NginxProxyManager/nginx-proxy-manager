const path       = require('path');
const webpack    = require('webpack');
const Visualizer = require('webpack-visualizer-plugin');

module.exports = {
    entry:     {
        main:  './src/frontend/js/main.js',
    },
    output:    {
        path:       path.resolve(__dirname, 'dist'),
        filename:   '[name].js',
        publicPath: '/'
    },

    module:    {
        rules: [
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
            }
        ]
    },
/*
    context: __dirname + '/src/frontend/js',
    entry:   './main.js',
    output:  {
        filename:          'main.js',
        path:              __dirname + '/dist/js',
        publicPath:        '/js/',
        sourceMapFilename: 'dnBOUAwY76qx3MmZxtHn.map'
    },
    module:  {
        loaders: [
            {
                test:    /\.js$/,
                exclude: /(node_modules|bower_components)/,
                loader:  'babel-loader'//,
                query:   {
                    presets: ['@babel/es2015']
                }
            },
            {
                test:   /\.ejs$/,
                loader: 'ejs-loader'
            }
        ]
    },
*/
    plugins:   [
        new webpack.ProvidePlugin({
            $:      'jquery',
            jQuery: 'jquery',
            _:      'underscore'
        }),
        new Visualizer({
            filename: '../webpack_stats.html'
        }),
        new webpack.optimize.LimitChunkCountPlugin({
            maxChunks:    1, // Must be greater than or equal to one
            minChunkSize: 999999999
        })
    ]
/*
    plugins: [
        new webpack.IgnorePlugin(/^\.\/locale$/, /moment$/),
        new webpack.optimize.LimitChunkCountPlugin({
            maxChunks: 1
        }),
        new webpack.ProvidePlugin({
            $:      'jquery',
            jQuery: 'jquery',
            _:      'underscore'
        }),
        new Visualizer({
            filename: '../../webpack_stats.html'
        }),
        new webpack.optimize.UglifyJsPlugin({
            compress: {
                unsafe:        true,
                drop_console:  false,
                drop_debugger: true,
                screw_ie8:     true,
                warnings:      false
            }
        })
    ]
*/
};
