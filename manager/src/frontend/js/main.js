'use strict';

const promise = require('es6-promise');
const $       = require('jquery');

global.jQuery = $;
global.$ = $;

const App = require('./app/main');

// es6-promise nukes the Native Promise impl - restore it if this happens.
// See also https://github.com/jakearchibald/es6-promise/issues/140
const NativePromise = window.Promise;
if (NativePromise) {
    window.Promise = NativePromise;
} else {
    promise.polyfill();
}

$(document).ready(() => {
    App.start();
});
