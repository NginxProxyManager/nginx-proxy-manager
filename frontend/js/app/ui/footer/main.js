const Mn       = require('backbone.marionette');
const template = require('./main.ejs');
const Cache    = require('../../cache');

module.exports = Mn.View.extend({
    className: 'container',
    template:  template,

    templateContext: {
        getVersion: function () {
            // 优先使用API获取的版本号，其次使用编译时版本号，最后使用默认值
            if (Cache.version) {
                return Cache.version;
            }
            
            // 尝试从全局变量获取编译时版本号
            if (typeof window !== 'undefined' && window.APP_VERSION) {
                return window.APP_VERSION;
            }
            
            // 尝试从body元素的data属性获取版本号
            if (typeof document !== 'undefined') {
                const appElement = document.getElementById('app');
                if (appElement && appElement.dataset.version) {
                    return appElement.dataset.version;
                }
            }
            
            return '0.0.0';
        }
    }
});
