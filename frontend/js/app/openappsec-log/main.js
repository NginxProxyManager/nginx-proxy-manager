const Mn = require('backbone.marionette');
const App = require('../main');
const OpenappsecLogModel = require('../../models/openappsec-log');
const ListView = require('./list/main');
const template = require('./main.ejs');
const ErrorView = require('../error/main');
const EmptyView = require('../empty/main');
const { data } = require('jquery');
const Controller = require('../controller');

let PaginationView = Mn.View.extend({
    tagName: 'ul',
    className: 'pagination justify-content-center mt-4 border-top pt-3',

    initialize: function (options) {
        this.totalPages = parseInt(options.totalPages) || 1;
        this.currentPage = parseInt(options.currentPage) || 1;
        this.totalDataLines = parseInt(options.totalDataLines) || 1;
        this.maxPageLinks = 15;
    },

    template: _.template(
        '<li class="page-item <%= currentPage === 1 ? "disabled" : "" %>">' +
        '<a class="page-link" href="/openappsec-log/page/1">First</a>' +
        '</li>' +
        '<li class="page-item <%= currentPage === 1 ? "disabled" : "" %>">' +
        '<a class="page-link" href="/openappsec-log/page/<%= currentPage - 1 %>">Previous</a>' +
        '</li>' +
        '<% let startPage = Math.max(1, currentPage - Math.floor(maxPageLinks / 2)); %>' +
        '<% let endPage = Math.min(startPage + maxPageLinks - 1, totalPages); %>' +
        '<% startPage = Math.max(1, endPage - maxPageLinks + 1); %>' +
        '<% for (let i = startPage; i <= endPage; i++) { %>' +
        '<li class="page-item <%= i === currentPage ? "active" : "" %>">' +
        '<a class="page-link" href="/openappsec-log/page/<%= i %>"><%= i %></a>' +
        '</li>' +
        '<% } %>' +
        '<li class="page-item <%= currentPage === totalPages ? "disabled" : "" %>">' +
        '<a class="page-link" href="/openappsec-log/page/<%= currentPage + 1 %>">Next</a>' +
        '</li>' +
        '<li class="page-item <%= currentPage === totalPages ? "disabled" : "" %>">' +
        '<a class="page-link" href="/openappsec-log/page/<%= totalPages %>">Last</a>' +
        '</li>' +
        '<li class="page-item disabled">' +
        '<span class="page-link">Total lines: <%= totalDataLines %></span>' +
        '</li>'
    ),

    templateContext: function () {
        return {
            totalDataLines: this.totalDataLines,
            totalPages: this.totalPages,
            currentPage: this.currentPage,
            maxPageLinks: this.maxPageLinks
        };
    }
});

module.exports = Mn.View.extend({
    id: 'openappsec-log',
    template: template,
    
    initialize: function (options) {
        this.options = options;
        // this.listenTo(App, 'openappsec-log:page', this.setPage);
    },    

    ui: {
        list_region: '.list-region',
        dimmer: '.dimmer',
        search: '.search-form',
        query: 'input[name="source-query"]',
        pagination_region: '.pagination-region'
    },

    fetch: App.Api.OpenappsecLog.getAll,

    showData: function (response) {
        const totalDataLines = response.length;
        this.showChildView('list_region', new ListView({
            collection: new OpenappsecLogModel.Collection(response),
            page: this.options.page,
            perPage: this.options.perPage
        }));

        this.showChildView('pagination_region', new PaginationView({
            totalDataLines: totalDataLines,
            totalPages: Math.ceil(totalDataLines / this.options.perPage),
            currentPage: this.options.page
        }));
    },

    showError: function (err) {
        this.showChildView('list_region', new ErrorView({
            code: err.code,
            message: err.message,
            retry: function () {
                App.Controller.showOpenappsecLog();
            }
        }));

        console.error(err);
    },

    showEmpty: function () {
        this.showChildView('list_region', new EmptyView({
            title: App.i18n('audit-log', 'empty'),
            subtitle: App.i18n('audit-log', 'empty-subtitle')
        }));
    },

    regions: {
        list_region: '@ui.list_region',
        pagination_region: '@ui.pagination_region'
    },

    events: {
        'submit @ui.search': function (e) {
            e.preventDefault();
            let query = this.ui.query.val();

            this.fetch(['user'], query)
                .then(response => this.showData(response))
                .catch(err => {
                    this.showError(err);
                });
        },

        'click @ui.pagination_region a': function (e) {
            e.preventDefault();

            // get the page number from the link
            const newPage = $(e.currentTarget).attr('href').split('/').pop();
            Controller.navigate('/openappsec-log/page/' + newPage, { trigger: true });
        }
    },

    onRender: function () {
        let view = this;
        let query = this.ui.query.val() || '';

        view.fetch(['user'], query)
            .then(response => {
                if (!view.isDestroyed() && response) {
                    view.showData(response);
                } else {
                    view.showEmpty();
                }
            })
            .catch(err => {
                view.showError(err);
            })
            .then(() => {
                view.ui.dimmer.removeClass('active');
            });
    }
});
