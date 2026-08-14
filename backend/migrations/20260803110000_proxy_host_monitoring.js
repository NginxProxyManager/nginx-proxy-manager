import { migrate as logger } from "../logger.js";

const migrateName = "proxy_host_monitoring";

export const up = async (knex) => {
	logger.info(`[${migrateName}] Migrating Up...`);
	await knex.schema.createTable("proxy_host_monitor_config", (table) => {
		table.increments("id").primary();
		table.integer("proxy_host_id").unsigned().notNullable().unique().index();
		table.boolean("enabled").notNullable().defaultTo(true);
		table.boolean("passive_desired_enabled").notNullable().defaultTo(true);
		table.boolean("passive_applied_enabled").notNullable().defaultTo(false);
		table.dateTime("passive_checked_on").nullable();
		table.json("passive_last_error").nullable();
		table.boolean("active_enabled").notNullable().defaultTo(true);
		table.string("probe_mode", 20).notNullable().defaultTo("tcp");
		table.integer("interval_seconds").unsigned().notNullable().defaultTo(60);
		table.integer("timeout_ms").unsigned().notNullable().defaultTo(5000);
		table.string("http_method", 8).notNullable().defaultTo("GET");
		table.string("path", 2048).notNullable().defaultTo("/");
		table.json("expected_statuses").nullable();
		table.boolean("follow_redirects").notNullable().defaultTo(false);
		table.boolean("tls_verify").notNullable().defaultTo(true);
		table.string("body_match_type", 16).nullable();
		table.string("body_match_value", 512).nullable();
		table.integer("failure_threshold").unsigned().notNullable().defaultTo(3);
		table.integer("success_threshold").unsigned().notNullable().defaultTo(2);
		table.float("degraded_5xx_ratio").notNullable().defaultTo(0.1);
		table.integer("degraded_gateway_error_count").unsigned().notNullable().defaultTo(5);
		table.integer("degraded_min_requests").unsigned().notNullable().defaultTo(20);
		table.integer("degraded_p95_ms").unsigned().nullable();
		table.dateTime("created_on").notNullable();
		table.dateTime("modified_on").notNullable();
	});
	await knex.schema.createTable("proxy_host_monitor_state", (table) => {
		table.integer("proxy_host_id").unsigned().primary();
		table.string("status", 20).notNullable().defaultTo("unknown");
		table.string("status_reason", 64).nullable();
		table.dateTime("status_changed_on").nullable();
		table.dateTime("last_checked_on").nullable();
		table.dateTime("last_success_on").nullable();
		table.dateTime("last_failure_on").nullable();
		table.integer("consecutive_successes").unsigned().notNullable().defaultTo(0);
		table.integer("consecutive_failures").unsigned().notNullable().defaultTo(0);
		table.integer("last_probe_duration_ms").unsigned().nullable();
		table.integer("last_http_status").unsigned().nullable();
		table.string("last_failure_code", 64).nullable();
		table.string("last_failure_summary", 512).nullable();
		table.dateTime("worker_seen_on").nullable();
		table.json("summary_5m").nullable();
		table.json("summary_24h").nullable();
		table.dateTime("updated_on").notNullable();
	});
	for (const name of ["proxy_host_metric_minute", "proxy_host_metric_hour"]) {
		await knex.schema.createTable(name, (table) => {
			table.increments("id").primary();
			table.integer("proxy_host_id").unsigned().notNullable().index();
			table.dateTime("bucket_start").notNullable();
			table.integer("schema_version").unsigned().notNullable().defaultTo(1);
			table.json("counters").notNullable();
			table.json("histograms").notNullable();
			table.json("gauges").notNullable();
			table.dateTime("created_on").notNullable();
			table.dateTime("modified_on").notNullable();
			table.unique(["proxy_host_id", "bucket_start"]);
			table.index(["bucket_start"]);
		});
	}
	await knex.schema.createTable("proxy_host_monitor_event", (table) => {
		table.increments("id").primary();
		table.integer("proxy_host_id").unsigned().notNullable().index();
		table.dateTime("occurred_on").notNullable().index();
		table.string("event_type", 32).notNullable();
		table.string("from_status", 20).nullable();
		table.string("to_status", 20).nullable();
		table.string("reason_code", 64).nullable();
		table.string("summary", 512).nullable();
		table.json("details").nullable();
	});
	await knex.schema.createTable("monitor_ingestion_cursor", (table) => {
		table.string("source_id", 80).primary();
		table.string("device_id", 128).nullable();
		table.bigInteger("offset").notNullable().defaultTo(0);
		table.text("partial_line").nullable();
		table.dateTime("last_event_timestamp").nullable();
		table.integer("schema_version").unsigned().notNullable().defaultTo(1);
		table.dateTime("updated_on").notNullable();
	});
	logger.info(`[${migrateName}] Monitoring tables created`);
};

export const down = async (knex) => {
	for (const name of [
		"monitor_ingestion_cursor",
		"proxy_host_monitor_event",
		"proxy_host_metric_hour",
		"proxy_host_metric_minute",
		"proxy_host_monitor_state",
		"proxy_host_monitor_config",
	]) {
		await knex.schema.dropTableIfExists(name);
	}
};
