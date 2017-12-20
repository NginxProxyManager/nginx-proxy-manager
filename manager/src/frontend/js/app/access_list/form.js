'use strict';

import Mn from 'backbone.marionette';

const _               = require('lodash');
const template        = require('./form.ejs');
const Controller      = require('../controller');
const Api             = require('../api');
const App             = require('../main');
const ItemView        = require('./item');
const AccessItemModel = require('../../models/access_item');

require('jquery-serializejson');

const ItemsView = Mn.CollectionView.extend({
    childView: ItemView
});

module.exports = Mn.View.extend({
    template: template,
    id:       'access-list-form',

    ui: {
        items_region: '.items',
        form:         'form',
        buttons:      'form button'
    },

    regions: {
        items_region: '@ui.items_region'
    },

    events: {
        'submit @ui.form': function (e) {
            e.preventDefault();

            let form_data  = this.ui.form.serializeJSON();
            let items_data = [];

            _.map(form_data.username, (val, idx) => {
                if (val.trim().length) {
                    items_data.push({
                        username: val.trim(),
                        password: form_data.password[idx]
                    });
                }
            });

            if (!items_data.length) {
                alert('You must specify at least 1 Username and Password combination');
                return;
            }

            let data = {
                name:  form_data.name,
                items: items_data
            };

            this.ui.buttons.prop('disabled', true).addClass('btn-disabled');
            let method = Api.Access.create;

            if (this.model.get('_id')) {
                // edit
                method   = Api.Access.update;
                data._id = this.model.get('_id');
            }

            method(data)
                .then((/*result*/) => {
                    App.UI.closeModal();
                    Controller.showAccess();
                })
                .catch((err) => {
                    alert(err.message);
                    this.ui.buttons.prop('disabled', false).removeClass('btn-disabled');
                });
        }
    },

    onRender: function () {
        let items = this.model.get('items');

        // Add empty items to the end of the list. This is cheating but hey I don't have the time to do it right
        let items_to_add = 5 - items.length;
        if (items_to_add) {
            for (let i = 0; i < items_to_add; i++) {
                items.push({});
            }
        }

        this.showChildView('items_region', new ItemsView({
            collection: new AccessItemModel.Collection(items)
        }));
    }
});
