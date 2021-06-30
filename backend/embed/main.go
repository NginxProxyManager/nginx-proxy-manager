package embed

import "embed"

// APIDocFiles contain all the files used for swagger schema generation
//go:embed api_docs
var APIDocFiles embed.FS

// Assets are frontend assets served from within this app
//go:embed assets
var Assets embed.FS

// MigrationFiles are database migrations
//go:embed migrations/*.sql
var MigrationFiles embed.FS
