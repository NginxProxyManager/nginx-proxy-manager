const Mn = require('backbone.marionette');
const App = require('../main');
const OpenappsecLogModel = require('../../models/openappsec-log');
const ListViewTab1 = require('./list-important/main');
const ListViewTab2 = require('./list-all/main');
const ListViewTab3 = require('./list-notifications/main');
const template = require('./main.ejs');
const paginationTemplate = require('./pagination.ejs');
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

    template: paginationTemplate,

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
    },    

    ui: {
        list_region: '.list-region',
        dimmer: '.dimmer',
        search: '.search-form',
        query: 'input[name="source-query"]',
        pagination_region: '.pagination-region'
    },

    fetch: App.Api.OpenappsecLog.getAll,

    showData: function (response, tab = 'tab1') {
        
        // Filter the response data for each tab
        const eventSeverities = ["critical", "high"];
        const tab1Data = response.filter(item => eventSeverities.includes(item.eventSeverity.trim().toLowerCase()));

        const eventNames = ["waap telemetry", "waap attack type telemetry", "ips stats"];
        const tab2Data = response.filter(item => !eventNames.includes(item.eventName.trim().toLowerCase()));

        const eventLevels = ["action item"];
        const tab3Data = response.filter(item => eventLevels.includes(item.eventLevel.trim().toLowerCase()));
        
        // Store the lengths of the original collections
        this.tabCollectionLengths = {
            tab1: response.length,
            tab2: response.length,
            tab3: response.length
        };
            
        this.tabCollections = {
            tab1: new OpenappsecLogModel.Collection(tab1Data),
            tab2: new OpenappsecLogModel.Collection(tab2Data),
            tab3: new OpenappsecLogModel.Collection(tab3Data)
        };

        this.tabPaginationStates = {
            tab1: { page: 1, perPage: this.options.perPage },
            tab2: { page: 1, perPage: this.options.perPage },
            tab3: { page: 1, perPage: this.options.perPage }
        };

        // Define an object mapping for the ListViews
        const listViewMapping = {
            tab1: ListViewTab1,
            tab2: ListViewTab2,
            tab3: ListViewTab3
        };

        // Get the current tab
        const currentTab = tab; // Replace this with the actual current tab

        // Select the ListView for the current tab
        const CurrentListView = listViewMapping[currentTab];

        // Show the ListView for the current tab
        this.showChildView('list_region', new CurrentListView({
            collection: this.tabCollections[currentTab],
            page: 1,
            perPage: this.options.perPage
            // page: this.tabPaginationStates[currentTab].page,
            // perPage: this.tabPaginationStates[currentTab].perPage
        }));

        // const totalDataLines = response.length;
        // this.showChildView('list_region', new ListView({
        //     collection: this.tabCollections.tab1,
        //     page: this.tabPaginationStates.tab1.page,
        //     perPage: this.tabPaginationStates.tab1.perPage
        // }));

        // this.showChildView('pagination_region', new PaginationView({
        //     totalDataLines: this.tabCollectionLengths.tab1,
        //     totalPages: Math.ceil(this.tabCollectionLengths.tab1 / this.options.perPage),
        //     currentPage: this.tabPaginationStates.tab1.page
        // }));

        // const totalDataLines = response.length;
        // this.showChildView('list_region', new ListView({
        //     collection: new OpenappsecLogModel.Collection(response),
        //     page: this.options.page,
        //     perPage: this.options.perPage
        // }));

        // this.showChildView('pagination_region', new PaginationView({
        //     totalDataLines: totalDataLines,
        //     totalPages: Math.ceil(totalDataLines / this.options.perPage),
        //     currentPage: this.options.page
        // }));
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

        'click .nav-link': 'onTabClick',

        'click @ui.pagination_region a': function (e) {
            e.preventDefault();

            // get the page number from the link
            const newPage = $(e.currentTarget).attr('href').split('/').pop();
            Controller.navigate('/openappsec-log/page/' + newPage, { trigger: true });
        }
    },

    onTabClick: function(event) {
        event.preventDefault();
        const selectedTab = event.target.id;
        let view = this;
        let query = this.ui.query.val() || '';

        view.fetch(['user'], query)
            .then(response => {
                if (!view.isDestroyed() && response) {
                    view.showData(response, selectedTab);
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

        // this.showChildView('list_region', new ListView({
        //     collection: this.tabCollections[selectedTab],
        //     page: this.tabPaginationStates[selectedTab].page,
        //     perPage: this.tabPaginationStates[selectedTab].perPage
        // }));

        // this.showChildView('pagination_region', new PaginationView({
        //     totalDataLines: this.tabCollections[selectedTab].length,
        //     totalPages: Math.ceil(this.tabCollections[selectedTab].length / this.options.perPage),
        //     currentPage: this.tabPaginationStates[selectedTab].page
        // }));
        
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
