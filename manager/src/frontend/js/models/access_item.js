'use strict';

import Backbone from 'backbone';

const model = Backbone.Model.extend({
    idAttribute: 'username',

    defaults: function () {
        return {
            username:   '',
            password:   '',
            hint:       ''
        };
    }
});

module.exports = {
    Model:      model,
    Collection: Backbone.Collection.extend({
        model: model
    })
};
