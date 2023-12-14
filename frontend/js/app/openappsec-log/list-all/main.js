const Mn       = require('backbone.marionette');
const ItemView = require('./item');
const template = require('./main.ejs');

let TableBody = Mn.CollectionView.extend({
    tagName: 'tbody',
    childView: ItemView,

    initialize: function (options) {
        this.options = new Backbone.Model(options);
        // this.page = options.page;
        // this.perPage = options.perPage;
        this.updatePage();
        // this.listenTo(this.options, 'change:page', this.updatePage);
    },

    updatePage: function () {
        let perPage = this.perPage || this.collection.length;
        let page = this.page || 1;
        let models;
        if (this.perPage && this.page) {
            models = this.collection.models.slice((page - 1) * perPage, page * perPage);
        } else {
            models = this.collection.models;
        }
        this.collection.reset(models);
    }
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

    onRender: function () {
        this.showChildView('body', new TableBody({
            collection: this.collection,
            // page:       this.options.page,
            // perPage:    this.options.perPage
        }));
    }
});
