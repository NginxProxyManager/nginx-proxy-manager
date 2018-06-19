'use strict';

const _        = require('underscore');
const Backbone = require('backbone');

const model = Backbone.Model.extend({
    idAttribute: 'id',

    defaults: function () {
        return {
            name:        '',
            nickname:    '',
            email:       '',
            is_disabled: false,
            roles:       []
        };
    },

    isAdmin: function () {
        return _.indexOf(this.get('roles'), 'admin') !== -1;
    }
});

module.exports = {
    Model:      model,
    Collection: Backbone.Collection.extend({
        model: model
    })
};
