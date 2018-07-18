'use strict';

const _      = require('underscore');
const Mn     = require('backbone.marionette');
const moment = require('moment');
const i18n   = require('../app/i18n');

let render = Mn.Renderer.render;

Mn.Renderer.render = function (template, data, view) {

    data = _.clone(data);

    data.i18n = i18n;

    /**
     * @param   {String} date
     * @returns {String}
     */
    data.formatDbDate = function (date, format) {
        if (typeof date === 'number') {
            return moment.unix(date).format(format);
        }

        return moment(date).format(format);
    };

    return render.call(this, template, data, view);
};

module.exports = Mn;
