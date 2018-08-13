'use strict';

const _       = require('underscore');
const Mn      = require('backbone.marionette');
const i18n    = require('../app/i18n');
const Helpers = require('./helpers');

let render = Mn.Renderer.render;

Mn.Renderer.render = function (template, data, view) {
    data              = _.clone(data);
    data.i18n         = i18n;
    data.formatDbDate = Helpers.formatDbDate;

    return render.call(this, template, data, view);
};

module.exports = Mn;
