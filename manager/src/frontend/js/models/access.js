'use strict';

const Backbone = require('backbone');

const model = Backbone.Model.extend({
    idAttribute: '_id',

    defaults: function () {
        return {
            name:  '',
            items: [],
            hosts: []
        };
    }
});

module.exports = {
    Model:      model,
    Collection: Backbone.Collection.extend({
        model: model
    })
};
