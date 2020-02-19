const Mn              = require('backbone.marionette');
const App             = require('../../main');
const AccessListModel = require('../../../models/access-list');
const template        = require('./form.ejs');
const ItemView        = require('./form/item');

require('jquery-serializejson');

const ItemsView = Mn.CollectionView.extend({
    childView: ItemView
});

module.exports = Mn.View.extend({
    template:  template,
    className: 'modal-dialog',

    ui: {
        items_region: '.items',
        form:         'form',
        buttons:      '.modal-footer button',
        cancel:       'button.cancel',
        save:         'button.save'
    },

    regions: {
        items_region: '@ui.items_region'
    },

    events: {
        'click @ui.save': function (e) {
            e.preventDefault();

            if (!this.ui.form[0].checkValidity()) {
                $('<input type="submit">').hide().appendTo(this.ui.form).click().remove();
                return;
            }

            let view       = this;
            let form_data  = this.ui.form.serializeJSON();
            let items_data = [];

            form_data.username.map(function (val, idx) {
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

            let method = App.Api.Nginx.AccessLists.create;
            let is_new = true;

            if (this.model.get('id')) {
                // edit
                is_new  = false;
                method  = App.Api.Nginx.AccessLists.update;
                data.id = this.model.get('id');
            }

            this.ui.buttons.prop('disabled', true).addClass('btn-disabled');
            method(data)
                .then(result => {
                    view.model.set(result);

                    App.UI.closeModal(function () {
                        if (is_new) {
                            App.Controller.showNginxAccess();
                        }
                    });
                })
                .catch(err => {
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
            collection: new Backbone.Collection(items)
        }));
    },

    initialize: function (options) {
        if (typeof options.model === 'undefined' || !options.model) {
            this.model = new AccessListModel.Model();
        }
    }
});
