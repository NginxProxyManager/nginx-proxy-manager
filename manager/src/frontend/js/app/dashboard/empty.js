'use strict';

import Mn from 'backbone.marionette';

const template   = require('./empty.ejs');
const HostModel  = require('../../models/host');
const Controller = require('../controller');

module.exports = Mn.View.extend({
    template: template,
    tagName:  'tr',

    ui: {
        create: 'button'
    },

    events: {
        'click @ui.create': function (e) {
            e.preventDefault();
            Controller.showHostForm(new HostModel.Model);
        }
    }
});
