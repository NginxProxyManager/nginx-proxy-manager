'use strict';

const Backbone = require('backbone');

const model = Backbone.Model.extend({
    idAttribute: 'id',

    defaults: function () {
        return {
            created_on:          null,
            modified_on:         null,
            owner:               null,
            domain_name:         '',
            ssl_enabled:         false,
            ssl_provider:        false,
            meta:                []
        };
    }
});

module.exports = {
    Model:      model,
    Collection: Backbone.Collection.extend({
        model: model
    })
};
