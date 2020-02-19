const Mn               = require('backbone.marionette');
const App              = require('../../main');
const CertificateModel = require('../../../models/certificate');
const ListView         = require('./list/main');
const ErrorView        = require('../../error/main');
const EmptyView        = require('../../empty/main');
const template         = require('./main.ejs');

module.exports = Mn.View.extend({
    id:       'nginx-certificates',
    template: template,

    ui: {
        list_region: '.list-region',
        add:         '.add-item',
        help:        '.help',
        dimmer:      '.dimmer'
    },

    regions: {
        list_region: '@ui.list_region'
    },

    events: {
        'click @ui.add': function (e) {
            e.preventDefault();
            let model = new CertificateModel.Model({provider: $(e.currentTarget).data('cert')});
            App.Controller.showNginxCertificateForm(model);
        },

        'click @ui.help': function (e) {
            e.preventDefault();
            App.Controller.showHelp(App.i18n('certificates', 'help-title'), App.i18n('certificates', 'help-content'));
        }
    },

    templateContext: {
        showAddButton: App.Cache.User.canManage('certificates')
    },

    onRender: function () {
        let view = this;

        App.Api.Nginx.Certificates.getAll(['owner'])
            .then(response => {
                if (!view.isDestroyed()) {
                    if (response && response.length) {
                        view.showChildView('list_region', new ListView({
                            collection: new CertificateModel.Collection(response)
                        }));
                    } else {
                        let manage = App.Cache.User.canManage('certificates');

                        view.showChildView('list_region', new EmptyView({
                            title:      App.i18n('certificates', 'empty'),
                            subtitle:   App.i18n('all-hosts', 'empty-subtitle', {manage: manage}),
                            link:       manage ? App.i18n('certificates', 'add') : null,
                            btn_color:  'pink',
                            permission: 'certificates',
                            action:     function () {
                                App.Controller.showNginxCertificateForm();
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
                        App.Controller.showNginxCertificates();
                    }
                }));

                console.error(err);
            })
            .then(() => {
                view.ui.dimmer.removeClass('active');
            });
    }
});
