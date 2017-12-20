'use strict';

import Mn from 'backbone.marionette';

const template   = require('./delete.ejs');
const Controller = require('../controller');
const Api        = require('../api');
const App        = require('../main');

module.exports = Mn.View.extend({
    template: template,

    ui: {
        buttons: 'form button',
        delete:  'button.delete'
    },

    events: {
        'click @ui.delete': function (e) {
            e.preventDefault();

            this.ui.buttons.prop('disabled', true).addClass('btn-disabled');

            Api.Access.delete(this.model.get('_id'))
                .then((/*result*/) => {
                    App.UI.closeModal();
                    Controller.showAccess();
                })
                .catch(err => {
                    alert(err.message);
                    this.ui.buttons.prop('disabled', false).removeClass('btn-disabled');
                });
        }
    }
});
