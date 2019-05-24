const _        = require('underscore');
const Backbone = require('backbone');

const model = Backbone.Model.extend({
    idAttribute: 'id',

    defaults: function () {
        return {
            id:          undefined,
            name:        '',
            nickname:    '',
            email:       '',
            is_disabled: false,
            roles:       [],
            permissions: null
        };
    },

    /**
     * @returns {Boolean}
     */
    isAdmin: function () {
        return _.indexOf(this.get('roles'), 'admin') !== -1;
    },

    /**
     * Checks if the perm has either `view` or `manage` value
     *
     * @param   {String}  item
     * @returns {Boolean}
     */
    canView: function (item) {
        let permissions = this.get('permissions');
        return permissions !== null && typeof permissions[item] !== 'undefined' && ['view', 'manage'].indexOf(permissions[item]) !== -1;
    },

    /**
     * Checks if the perm has `manage` value
     *
     * @param   {String}  item
     * @returns {Boolean}
     */
    canManage: function (item) {
        let permissions = this.get('permissions');
        return permissions !== null && typeof permissions[item] !== 'undefined' && permissions[item] === 'manage';
    }
});

module.exports = {
    Model:      model,
    Collection: Backbone.Collection.extend({
        model: model
    })
};
