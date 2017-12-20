'use strict';

import promise from 'es6-promise';
import $ from 'jquery';

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
