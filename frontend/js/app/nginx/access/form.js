const Mn              = require('backbone.marionette');
const App             = require('../../main');
const AccessListModel = require('../../../models/access-list');
const template        = require('./form.ejs');
const ItemView        = require('./form/item');
const ClientView      = require('./form/client');
const ClientCAView    = require('./form/clientca');

require('jquery-serializejson');
require('selectize');

const Helpers = require("../../../lib/helpers");
const certListItemTemplate = require("../certificates-list-item.ejs");

const ItemsView = Mn.CollectionView.extend({
    childView: ItemView
});

const ClientsView = Mn.CollectionView.extend({
    childView: ClientView
});

const ClientCAsView = Mn.CollectionView.extend({
    childView: ClientCAView
});

module.exports = Mn.View.extend({
    template:  template,
    className: 'modal-dialog',

    ui: {
        items_region:       '.items',
        clients_region:     '.clients',
        clientcas_region:   '.clientcas',
        certificate_select: 'select[id="certificate_search"]',
        form:               'form',
        buttons:            '.modal-footer button',
        cancel:             'button.cancel',
        save:               'button.save',
        access_add:         'button.access_add',
        auth_add:           'button.auth_add',
        clientca_add:       'button.clientca_add',
        clientca_del:       'button.clientca_del'
    },

    regions: {
        items_region:   '@ui.items_region',
        clients_region: '@ui.clients_region',
        clientcas_region: '@ui.clientcas_region'
    },

    events: {
        'click @ui.save': function (e) {
            e.preventDefault();

            console.log(this.ui.form); // FIXME

            if (!this.ui.form[0].checkValidity()) {
                $('<input type="submit">').hide().appendTo(this.ui.form).click().remove();
                return;
            }

            let view         = this;
            let items_data   = [];
            let clients_data = [];
            let clientcas_data = [];

            let form_data    = this.ui.form.serializeJSON();

            form_data.username.map(function (val, idx) {
                if (val.trim().length) {
                    items_data.push({
                        username: val.trim(),
                        password: form_data.password[idx]
                    });
                }
            });

            form_data.address.map(function (val, idx) {
                if (val.trim().length) {
                    clients_data.push({
                        address: val.trim(),
                        directive: form_data.directive[idx]
                    })
                }
            });

            if (form_data.certificate_id !== undefined) {
                form_data.certificate_id.map(function (val, idx) {
                    clientcas_data.push(parseInt(val, 10))
                });
            }

            if (!items_data.length && !clients_data.length && !clientcas_data.length) {
                alert('You must specify at least 1 Authorization or Access rule');
                return;
            }

            let data = {
                name:       form_data.name,
                satisfy_any: !!form_data.satisfy_any,
                pass_auth: !!form_data.pass_auth,
                items:      items_data,
                clients:    clients_data,
                clientcas:  clientcas_data
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
        },
        'click @ui.access_add': function (e) { 
            e.preventDefault();

            let clients = this.model.get('clients');
            clients.push({});
            this.showChildView('clients_region', new ClientsView({
                collection: new Backbone.Collection(clients)
            }));
        },
        'click @ui.auth_add': function (e) { 
            e.preventDefault();

            let items = this.model.get('items');
            items.push({});
            this.showChildView('items_region', new ItemsView({
                collection: new Backbone.Collection(items)
            }));
        },
        'click @ui.clientca_add': function (e) {
            e.preventDefault();

            App.Api.Nginx.Certificates.getAllClientCertificates().then((certificates) => {
                let value = this.ui.certificate_select[0].value;
                if (value === undefined || value === '') {
                    return;
                }

                let certificate_id = parseInt(this.ui.certificate_select[0].value, 10);
                let cert = certificates.filter((cert) => { return cert.id === certificate_id })[0];

                let clientcas = this.model.get('clientcas');
                clientcas.push({
                    certificate: cert
                });

                this.ui.certificate_select[0].selectize.clear();

                this.showChildView('clientcas_region', new ClientCAsView({
                    collection: new Backbone.Collection(clientcas)
                }));
            })
        },
        'click @ui.clientca_del': function (e) {
            e.preventDefault();

            let certificate_id = parseInt(e.currentTarget.dataset.value, 10);

            let clientcas = this.model.get('clientcas');
            this.model.set('clientcas', clientcas.filter((e) => { return e.certificate.id !== certificate_id }));
            clientcas = this.model.get('clientcas');

            this.showChildView('clientcas_region', new ClientCAsView({
                collection: new Backbone.Collection(clientcas)
            }));
        }
    },

    onRender: function () {
        let items = this.model.get('items');
        let clients = this.model.get('clients');
        let clientcas = this.model.get('clientcas');

        // Ensure at least one field is shown initally
        if (!items.length) items.push({});
        if (!clients.length) clients.push({});
        if (!clientcas.length) clients.push({});

        this.showChildView('items_region', new ItemsView({
            collection: new Backbone.Collection(items)
        }));

        this.showChildView('clients_region', new ClientsView({
            collection: new Backbone.Collection(clients)
        }));

        this.showChildView('clientcas_region', new ClientCAsView({
            collection: new Backbone.Collection(clientcas)
        }));

        this.ui.certificate_select.selectize({
            valueField:       'id',
            labelField:       'nice_name',
            searchField:      ['nice_name', 'domain_names'],
            create:           false,
            preload:          true,
            allowEmptyOption: true,
            render:           {
                option: function (item) {
                    item.i18n         = App.i18n;
                    item.formatDbDate = Helpers.formatDbDate;
                    return certListItemTemplate(item);
                }
            },
            load:             function (query, callback) {
                App.Api.Nginx.Certificates.getAllClientCertificates()
                  .then(rows => {
                      callback(rows);
                  })
                  .catch(err => {
                      console.error(err);
                      callback();
                  });
            },
            onLoad:           function () {}
        });
    },

    initialize: function (options) {
        if (typeof options.model === 'undefined' || !options.model) {
            this.model = new AccessListModel.Model();
        }
    }
});
