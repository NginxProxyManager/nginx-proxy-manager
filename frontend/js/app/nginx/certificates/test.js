const Mn       = require('backbone.marionette');
const App      = require('../../main');
const template = require('./test.ejs');

module.exports = Mn.View.extend({
	template:  template,
	className: 'modal-dialog',

	ui: {
		waiting: '.waiting',
		error:   '.error',
		success: '.success',
		close:   'button.cancel'
	},

    events: {
        'click @ui.close': function (e) {
            e.preventDefault();
            if (this.model.get('back_to_add')) {
                App.Controller.showNginxCertificateForm(this.model);
            } else {
                App.UI.closeModal();
            }
        },
    },

	onRender: function () {
		this.ui.error.hide();
		this.ui.success.hide();

		App.Api.Nginx.Certificates.testHttpChallenge(this.model.get('domain_names'))
			.then((result) => {
				let allOk = true;
				let text  = '';

				for (const domain in result) {
					const status = result[domain];
					if (status === 'ok') {
						text += `<p><strong>${domain}:</strong> ${App.i18n('certificates', 'reachability-ok')}</p>`;
					} else {
						allOk = false;
						if (status === 'no-host') {
							text += `<p><strong>${domain}:</strong> ${App.i18n('certificates', 'reachability-not-resolved')}</p>`;
						} else if (status === 'failed') {
							text += `<p><strong>${domain}:</strong> ${App.i18n('certificates', 'reachability-failed-to-check')}</p>`;
						} else if (status === '404') {
							text += `<p><strong>${domain}:</strong> ${App.i18n('certificates', 'reachability-404')}</p>`;
						} else if (status === 'wrong-data') {
							text += `<p><strong>${domain}:</strong> ${App.i18n('certificates', 'reachability-wrong-data')}</p>`;
						} else if (status.startsWith('other:')) {
							const code = status.substring(6);
							text      += `<p><strong>${domain}:</strong> ${App.i18n('certificates', 'reachability-other', {code})}</p>`;
						} else {
							// This should never happen
							text += `<p><strong>${domain}:</strong> ?</p>`;
						}
					}
				}

				this.ui.waiting.hide();
				if (allOk) {
					this.ui.success.html(text).show();
				} else {
					this.ui.error.html(text).show();
				}
				this.ui.close.prop('disabled', false);
			})
			.catch((e) => {
				console.error(e);
				this.ui.waiting.hide();
				this.ui.error.text(App.i18n('certificates', 'reachability-failed-to-reach-api')).show();
				this.ui.close.prop('disabled', false);
			});
	}
});
