const path                 = require('path');
const webpack              = require('webpack');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const Visualizer           = require('webpack-visualizer-plugin');
const CopyWebpackPlugin    = require('copy-webpack-plugin');

module.exports = {
    entry:     {
        main:  './src/frontend/js/index.js',
        login: './src/frontend/js/login.js'
    },
    output:    {
        path:       path.resolve(__dirname, 'dist'),
        filename:   'js/[name].js',
        publicPath: '/'
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
            'circle-progress':  'tabler-ui/dist/assets/js/vendors/circle-progress.min'
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
        new MiniCssExtractPlugin({
            filename:      'css/[name].css',
            chunkFilename: 'css/[id].css'
        }),
        new Visualizer({
            filename: '../webpack_stats.html'
        }),
        new CopyWebpackPlugin([{
            from:    'src/frontend/app-images',
            to:      'images',
            toType:  'dir',
            context: '/srv/app'
        }]),
        new webpack.optimize.LimitChunkCountPlugin({
            maxChunks:    1, // Must be greater than or equal to one
            minChunkSize: 999999999
        })
    ],
    /*
    optimization: {
        splitChunks: {
            chunks (chunk) {
                // exclude `my-excluded-chunk`
                return false;
            },
            minSize:     999999999,
            minChunks:   1,
            name:        true,
            cacheGroups: {
                vendors: {
                    test:     /[\\/]node_modules[\\/]/,
                    priority: -10
                },
                default: {
                    minChunks:          2,
                    priority:           -20,
                    reuseExistingChunk: true
                }
            }
        }
    },
    */
    devServer: {
        contentBase:      path.join(__dirname, 'dist'),
        compress:         true,
        port:             8080,
        disableHostCheck: true,
        host:             '0.0.0.0'
    }
};
