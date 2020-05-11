const QueryBuilder = require('objection').QueryBuilder;

class ProxyHostQueryBuilder extends QueryBuilder {
	execute () {
		this.allowGraph('[access_list.[items, clients]]');
		this.withGraphFetched('[access_list.[items, clients]]');
		return super.execute();
	}
}

module.exports = ProxyHostQueryBuilder;
