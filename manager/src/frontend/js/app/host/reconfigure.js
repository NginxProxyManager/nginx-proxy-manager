'use strict';

import Mn from 'backbone.marionette';

const template = require('./reconfigure.ejs');
const Api      = require('../api');
const App      = require('../main');

module.exports = Mn.View.extend({
    template: template,

    ui: {
        buttons:     'form button',
        reconfigure: 'button.reconfigure'
    },

    events: {
        'click @ui.reconfigure': function (e) {
            e.preventDefault();

            this.ui.buttons.prop('disabled', true).addClass('btn-disabled');

            Api.Hosts.reconfigure(this.model.get('_id'))
                .then((/*result*/) => {
                    App.UI.closeModal();
                })
                .catch(err => {
                    alert(err.message);
                    this.ui.buttons.prop('disabled', false).removeClass('btn-disabled');
                });
        }
    }
});
