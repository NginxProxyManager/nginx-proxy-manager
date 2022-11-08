package doc

import "embed"

// SwaggerFiles contain all the files used for swagger schema generation
//
//go:embed api.swagger.json
//go:embed components
//go:embed paths
var SwaggerFiles embed.FS
