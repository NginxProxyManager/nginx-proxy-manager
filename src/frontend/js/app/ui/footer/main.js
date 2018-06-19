'use strict';

const Mn       = require('backbone.marionette');
const template = require('./main.ejs');
const App      = require('../../main');

module.exports = Mn.View.extend({
    className: 'container',
    template:  template,

    templateContext: {
        getVersion: function () {
            return App.version;
        }
    }
});
