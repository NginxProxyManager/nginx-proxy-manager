const Mn       = require('backbone.marionette');
const ItemView = require('./item');
const template = require('./main.ejs');

let TableBody = Mn.CollectionView.extend({
    tagName: 'tbody',
    childView: ItemView,

    initialize: function (options) {
        this.options = new Backbone.Model(options);
        this.page = options.page;
        this.perPage = options.perPage;
        this.updatePage();
        this.listenTo(this.options, 'change:page', this.updatePage);
    },

    updatePage: function () {
        console.log('updatePage');
        let models = this.collection.models.slice((this.page - 1) * this.perPage, this.page * this.perPage);
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
            page:       this.options.page,
            perPage:    this.options.perPage
        }));
    }
});
