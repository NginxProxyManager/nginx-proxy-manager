const Backbone = require('backbone');

const model = Backbone.Model.extend({
    idAttribute: 'id',
    defaults: function () {
        return {
            id:              undefined,
            created_on:      null,
            modified_on:     null,
            owner_user_id:   0,
            name:            '',
            scheme:          'http',
            servers:         [],
            meta:            {}
        };
}});

module.exports = {
    Model: model,
    Collection: Backbone.Collection.extend({
        model: model
    })
};
