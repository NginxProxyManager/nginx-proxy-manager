'use strict';

import Mn from 'backbone.marionette';

const _          = require('lodash');
const template   = require('./stream_form.ejs');
const Controller = require('../controller');
const Api        = require('../api');
const App        = require('../main');

require('jquery-serializejson');

module.exports = Mn.View.extend({
    template: template,

    ui: {
        form:    'form',
        buttons: 'form button'
    },

    events: {
        'submit @ui.form': function (e) {
            e.preventDefault();
            let data = _.extend({}, this.ui.form.serializeJSON());

            data.type = 'stream';

            // Ports are integers
            data.incoming_port = parseInt(data.incoming_port, 10);
            data.forward_port  = parseInt(data.forward_port, 10);

            if (typeof data.protocols === 'undefined' || !data.protocols.length) {
                alert('You must select one or more Protocols');
                return;
            }

            this.ui.buttons.prop('disabled', true).addClass('btn-disabled');
            let method = Api.Hosts.create;

            if (this.model.get('_id')) {
                // edit
                method   = Api.Hosts.update;
                data._id = this.model.get('_id');
            }

            method(data)
                .then((/*result*/) => {
                    App.UI.closeModal();
                    Controller.showDashboard();
                })
                .catch((err) => {
                    alert(err.message);
                    this.ui.buttons.prop('disabled', false).removeClass('btn-disabled');
                });
        }
    },

    templateContext: {
        hasStreamProtocol: function (protocol) {
            return this.protocols.indexOf(protocol) !== -1;
        }
    }
});
