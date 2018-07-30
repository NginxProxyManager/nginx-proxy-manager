'use strict';

const Mn          = require('backbone.marionette');
const template    = require('./empty.ejs');
const AccessModel = require('../../models/access');
const Controller  = require('../controller');

module.exports = Mn.View.extend({
    template: template,
    tagName:  'tr',

    ui: {
        create: 'button'
    },

    events: {
        'click @ui.create': function (e) {
            e.preventDefault();
            Controller.showAccessListForm(new AccessModel.Model);
        }
    }
});
