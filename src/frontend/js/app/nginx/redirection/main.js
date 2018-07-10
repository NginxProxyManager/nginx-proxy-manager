'use strict';

const Mn                   = require('backbone.marionette');
const RedirectionHostModel = require('../../../models/redirection-host');
const Api                  = require('../../api');
const Cache                = require('../../cache');
const Controller           = require('../../controller');
const ListView             = require('./list/main');
const ErrorView            = require('../../error/main');
const template             = require('./main.ejs');
const EmptyView            = require('../../empty/main');

module.exports = Mn.View.extend({
    id:       'nginx-redirections',
    template: template,

    ui: {
        list_region: '.list-region',
        add:         '.add-item',
        dimmer:      '.dimmer'
    },

    regions: {
        list_region: '@ui.list_region'
    },

    events: {
        'click @ui.add': function (e) {
            e.preventDefault();
            Controller.showNginxRedirectionForm();
        }
    },

    templateContext: {
        showAddButton: Cache.User.canManage('redirection_hosts')
    },

    onRender: function () {
        let view = this;

        Api.Nginx.RedirectionHosts.getAll()
            .then(response => {
                if (!view.isDestroyed()) {
                    if (response && response.length) {
                        view.showChildView('list_region', new ListView({
                            collection: new RedirectionHostModel.Collection(response)
                        }));
                    } else {
                        let manage = Cache.User.canManage('redirection_hosts');

                        view.showChildView('list_region', new EmptyView({
                            title:     'There are no Redirection Hosts',
                            subtitle:  manage ? 'Why don\'t you create one?' : 'And you don\'t have permission to create one.',
                            link:      manage ? 'Add Redirection Host' : null,
                            btn_color: 'yellow',
                            action:    function () {
                                Controller.showNginxRedirectionForm();
                            }
                        }));
                    }
                }
            })
            .catch(err => {
                view.showChildView('list_region', new ErrorView({
                    code:    err.code,
                    message: err.message,
                    retry:   function () {
                        Controller.showNginxRedirection();
                    }
                }));

                console.error(err);
            })
            .then(() => {
                view.ui.dimmer.removeClass('active');
            });
    }
});
