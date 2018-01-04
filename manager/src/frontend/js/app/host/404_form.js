'use strict';

import Mn from 'backbone.marionette';

const _          = require('lodash');
const template   = require('./404_form.ejs');
const Controller = require('../controller');
const Api        = require('../api');
const App        = require('../main');

require('jquery-serializejson');

module.exports = Mn.View.extend({
    template: template,

    ui: {
        form:              'form',
        buttons:           'form button',
        ssl_options:       '.ssl_options',
        ssl:               'input[name="ssl"]',
        letsencrypt_email: 'input[name="letsencrypt_email"]',
        accept_tos:        'input[name="accept_tos"]'
    },

    events: {
        'change @ui.ssl': function (e) {
            let inputs = this.ui.letsencrypt_email.add(this.ui.accept_tos);
            if (this.ui.ssl.prop('checked')) {
                this.ui.ssl_options.show();
                inputs.prop('required', true);
            } else {
                this.ui.ssl_options.hide();
                inputs.prop('required', false);
            }
        },

        'submit @ui.form': function (e) {
            e.preventDefault();
            let data = _.extend({}, this.ui.form.serializeJSON());

            // Change text true's to bools
            _.map(data, function (val, key) {
                if (val === 'true') {
                    data[key] = true;
                }
            });

            // This is a 404 host
            data.type = '404';

            // accept_tos is not required for backend
            delete data.accept_tos;

            if (!data.ssl) {
                delete data.letsencrypt_email;
            }

            this.ui.buttons.prop('disabled', true).addClass('btn-disabled');
            let method = Api.Hosts.create;

            if (this.model.get('_id')) {
                // edit
                method  = Api.Hosts.update;
                data._id = this.model.get('_id');
            }

            method(data)
                .then((/*result*/) => {
                    App.UI.closeModal();
                    Controller.showDashboard();
                })
                .catch(err => {
                    alert(err.message);
                    this.ui.buttons.prop('disabled', false).removeClass('btn-disabled');
                });
        }
    }
});
