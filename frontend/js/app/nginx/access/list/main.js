const Mn       = require('backbone.marionette');
const App      = require('../../../main');
const ItemView = require('./item');
const template = require('./main.ejs');

const TableBody = Mn.CollectionView.extend({
    tagName:   'tbody',
    childView: ItemView
});

module.exports = Mn.View.extend({
    tagName:   'table',
    className: 'table table-hover table-outline table-vcenter card-table',
    template:  template,

    regions: {
        body: {
            el:             'tbody',
            replaceElement: true
        }
    },

    templateContext: {
        canManage: App.Cache.User.canManage('access_lists')
    },

    onRender: function () {
        this.showChildView('body', new TableBody({
            collection: this.collection
        }));
    }
});
