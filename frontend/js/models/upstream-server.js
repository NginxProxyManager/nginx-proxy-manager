const Backbone = require('backbone');

const model = Backbone.Model.extend({
  defaults: function () {
    return {
      host: '',
      port: 80,
      weight: ''
    };
  }
});

module.exports = {
  Model: model,
  Collection: Backbone.Collection.extend({
    model: model
  })
};
