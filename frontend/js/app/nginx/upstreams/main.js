const Mn = require('backbone.marionette');
const App = require('../../main');
const UpstreamModel = require('../../../models/upstream');
const ListView = require('./list/main');
const ErrorView = require('../../error/main');
const EmptyView = require('../../empty/main');
const template = require('./main.ejs');

module.exports = Mn.View.extend({
  id: 'nginx-upstreams',
  template: template,

  ui: {
    list_region: '.list-region',
    add: '.add-item',
    help: '.help',
    dimmer: '.dimmer',
    search: '.search-form',
    query: 'input[name="source-query"]'
  },

  fetch: App.Api.Nginx.Upstreams.getAll,

  showData: function(response) {
    this.showChildView('list_region', new ListView({
      collection: new UpstreamModel.Collection(response)
    }));
  },

  showError: function(err) {
    this.showChildView('list_region', new ErrorView({
      code: err.code,
      message: err.message,
      retry: function () {
        App.Controller.showNginxUpstreams();
      }
    }));
    console.error(err);
  },

  showEmpty: function() {
    let manage = App.Cache.User.canManage('upstreams');
    this.showChildView('list_region', new EmptyView({
      title: 'No Upstreams Found',
      subtitle: 'You can create upstreams to load balance your services.',
      link: manage ? 'Add Upstream' : null,
      btn_color: 'green',
      permission: 'upstreams',
      action: function () {
        App.Controller.showNginxUpstreamForm();
      }
    }));
  },

  regions: {
    list_region: '@ui.list_region'
  },

  events: {
    'click @ui.add': function (e) {
      e.preventDefault();
      App.Controller.showNginxUpstreamForm();
    },

    'click @ui.help': function (e) {
      e.preventDefault();
      App.Controller.showHelp('Upstreams', 'Upstreams allow you to define a pool of backend servers. Proxy hosts can then use these upstreams to load balance traffic across multiple servers.');
    },

    'submit @ui.search': function (e) {
      e.preventDefault();
      let query = this.ui.query.val();
      this.fetch(['owner'], query)
        .then(response => this.showData(response))
        .catch(err => {
          this.showError(err);
        });
    }
  },

  templateContext: {
    showAddButton: App.Cache.User.canManage('upstreams')
  },

  onRender: function () {
    let view = this;
    view.fetch(['owner'])
      .then(response => {
        if (!view.isDestroyed()) {
          if (response && response.length) {
            view.showData(response);
          } else {
            view.showEmpty();
          }
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
