// Objection Docs:
// http://vincit.github.io/objection.js/

const db    = require('../db');
const Model = require('objection').Model;
const now   = require('./now_helper');

Model.knex(db);

class AccessListClientCAs extends Model {
	$beforeInsert () {
		this.created_on  = now();
		this.modified_on = now();

		// Default for meta
		if (typeof this.meta === 'undefined') {
			this.meta = {};
		}
	}

	$beforeUpdate () {
		this.modified_on = now();
	}

	static get name () {
		return 'AccessListClientCAs';
	}

	static get tableName () {
		return 'access_list_clientcas';
	}

	static get jsonAttributes () {
		return ['meta'];
	}

	static get relationMappings () {
		return {
			access_list: {
				relation:   Model.HasOneRelation,
				modelClass: require('./access_list'),
				join:       {
					from: 'access_list_clientcas.access_list_id',
					to:   'access_list.id'
				},
				modify: function (qb) {
					qb.where('access_list.is_deleted', 0);
				}
			},
			certificate: {
				relation:   Model.HasOneRelation,
				modelClass: require('./certificate'),
				join:			    {
					from: 'access_list_clientcas.certificate_id',
					to:   'certificate.id'
				}
			}
		};
	}
}

module.exports = AccessListClientCAs;
