const Mn                  = require('backbone.marionette');
const App                 = require('../../main');
const UpstreamModel       = require('../../../models/upstream');
const UpstreamServerModel = require('../../../models/upstream-server');
const template            = require('./form.ejs');
const ServerView          = require('./form/form-server');
require('jquery-serializejson');

const ServersView = Mn.CollectionView.extend({
    childView: ServerView
});

module.exports = Mn.View.extend({
    template:  template,
    className: 'modal-dialog modal-lg',
    serversCollection: new UpstreamServerModel.Collection(),

    ui: {
        form:           'form',
        buttons:        '.modal-footer button',
        cancel:         'button.cancel',
        save:           'button.save',
        add_server:     'button.add-server',
        servers_region: '.servers'
    },

    regions: {
        servers_region: '@ui.servers_region'
    },

    events: {
        'click @ui.save': function (e) {
            e.preventDefault();
            if (!this.ui.form[0].checkValidity()) {
                $('<input type="submit">').hide().appendTo(this.ui.form).click().remove();
                return;
            }

            let view = this;
            let data = this.ui.form.serializeJSON();

            // Convert servers object to array
            if (data.servers) {
                data.servers = Object.values(data.servers);
            } else {
                data.servers = [];
            }

            if (data.servers.length === 0) {
                alert('You must specify at least 1 server.');
                return;
            }

            let method = App.Api.Nginx.Upstreams.create;
            let is_new = true;

            if (this.model.get('id')) {
                is_new  = false;
                method  = App.Api.Nginx.Upstreams.update;
                data.id = this.model.get('id');
            }

            this.ui.buttons.prop('disabled', true).addClass('btn-disabled');

            method(data)
                .then(result => {
                    view.model.set(result);
                    App.UI.closeModal(() => {
                        if (is_new) {
                            App.Controller.showNginxUpstreams();
                        }
                    });
                })
                .catch(err => {
                    alert(err.message);
                    this.ui.buttons.prop('disabled', false).removeClass('btn-disabled');
                });
        },

        'click @ui.add_server': function(e) {
            e.preventDefault();
            this.serversCollection.add(new UpstreamServerModel.Model());
        }
    },

    onRender: function () {
        this.showChildView('servers_region', new ServersView({
            collection: this.serversCollection
        }));
    },

    initialize: function (options) {
        if (typeof options.model === 'undefined' || !options.model) {
            this.model = new UpstreamModel.Model();
        }

        this.serversCollection = new UpstreamServerModel.Collection(this.model.get('servers'));

        if (this.serversCollection.length === 0) {
            this.serversCollection.add(new UpstreamServerModel.Model());
        }
    }
});
