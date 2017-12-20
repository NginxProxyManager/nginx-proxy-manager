'use strict';

import Mn from 'backbone.marionette';

const template = require('./renew.ejs');
const Api      = require('../api');
const App      = require('../main');

module.exports = Mn.View.extend({
    template: template,

    ui: {
        buttons: 'form button',
        renew:   'button.renew'
    },

    events: {
        'click @ui.renew': function (e) {
            e.preventDefault();

            this.ui.buttons.prop('disabled', true).addClass('btn-disabled');

            Api.Hosts.renew(this.model.get('_id'))
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
