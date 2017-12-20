'use strict';

import Mn from 'backbone.marionette';

const template   = require('./advanced.ejs');
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
            let data = this.ui.form.serializeJSON();
            data._id = this.model.get('_id');

            this.ui.buttons.prop('disabled', true).addClass('btn-disabled');

            Api.Hosts.update(data)
                .then((/*result*/) => {
                    App.UI.closeModal();
                    Controller.showDashboard();
                })
                .catch((err) => {
                    alert(err.message);
                    this.ui.buttons.prop('disabled', false).removeClass('btn-disabled');
                });
        }
    }
});
