'use strict';

import Mn from 'backbone.marionette';

const Api             = require('../api');
const template        = require('./main.ejs');
const Controller      = require('../controller');
const RowView         = require('./row');
const AccessListModel = require('../../models/access');
const EmptyView       = require('./empty');

const TableBody = Mn.CollectionView.extend({
    tagName:   'tbody',
    childView: RowView
});

module.exports = Mn.View.extend({
    template: template,
    id:       'access',

    regions: {
        list_region: {
            el:             'tbody',
            replaceElement: true
        }
    },

    ui: {
        'create': 'th button'
    },

    events: {
        'click @ui.create': function (e) {
            e.preventDefault();
            Controller.showAccessListForm(new AccessListModel.Model);
        }
    },

    onRender: function () {
        let view = this;

        Api.Access.getAll()
            .then(response => {
                if (!view.isDestroyed()) {
                    if (response && response.length) {
                        view.showChildView('list_region', new TableBody({
                            collection: new AccessListModel.Collection(response)
                        }));
                    } else {
                        view.showChildView('list_region', new EmptyView());
                    }

                    view.trigger('loaded');
                }
            })
            .catch(err => {
                Controller.showError(err, 'Could not fetch Access Lists');
                view.trigger('loaded');
            });
    }
});

