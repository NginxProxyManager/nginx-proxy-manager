const Mn           = require('backbone.marionette');
const App          = require('../main');
const SettingModel = require('../../models/setting');
const ListView     = require('./list/main');
const ErrorView    = require('../error/main');
const Cache        = require('../cache');
const template     = require('./main.ejs');

module.exports = Mn.View.extend({
    id:       'settings',
    template: template,

    ui: {
        list_region: '.list-region',
        add:         '.add-item',
        dimmer:      '.dimmer'
    },

    regions: {
        list_region: '@ui.list_region'
    },

    onRender: function () {
        let view = this;

        App.Api.Settings.getAll()
            .then(response => {
                if (!view.isDestroyed()) {
                    // 添加语言设置项到设置列表
                    let settingsData = response || [];
                    settingsData.push({
                        id: 'language',
                        name: 'Interface Language',
                        description: 'Choose interface display language',
                        value: Cache.locale
                    });
                    
                    view.showChildView('list_region', new ListView({
                        collection: new SettingModel.Collection(settingsData)
                    }));
                }
            })
            .catch(err => {
                // 即使出错也显示语言设置项
                let settingsData = [{
                    id: 'language',
                    name: 'Interface Language',
                    description: 'Choose interface display language',
                    value: Cache.locale
                }];
                
                view.showChildView('list_region', new ListView({
                    collection: new SettingModel.Collection(settingsData)
                }));

                console.error(err);
            })
            .then(() => {
                view.ui.dimmer.removeClass('active');
            });
    }
});
