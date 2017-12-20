'use strict';

import Mn from 'backbone.marionette';

const template = require('./main.ejs');

module.exports = Mn.View.extend({
    id: 'error',
    template: template,

    options: {
        err: null,
        nice_msg: 'Unknown error'
    },

    templateContext: function () {
        let view = this;
        return {
            getNiceMessage: function () {
                return view.options.nice_msg;
            },

            getErrorMessage: function () {
                return view.options.err ? view.options.err.message : '';
            }
        };
    },

    initialize: function () {
        console.error(this.options.err);
    }
});

