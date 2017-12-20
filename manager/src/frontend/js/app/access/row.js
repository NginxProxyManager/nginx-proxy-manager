'use strict';

import Mn from 'backbone.marionette';

const template   = require('./row.ejs');
const Controller = require('../controller');

module.exports = Mn.View.extend({
    template: template,
    tagName:  'tr',

    ui: {
        edit:   'button.edit',
        delete: 'button.delete'
    },

    events: {
        'click @ui.edit': function (e) {
            e.preventDefault();
            Controller.showAccessListForm(this.model);
        },

        'click @ui.delete': function (e) {
            e.preventDefault();
            Controller.showDeleteAccessList(this.model);
        }
    },

    initialize: function () {
        this.listenTo(this.model, 'change', this.render);
    }
});
