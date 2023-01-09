package handler

import (
	"encoding/json"
	"fmt"
	"io/fs"
	"net/http"
	"strings"

	"npm/embed"
	"npm/internal/api/schema"
	"npm/internal/config"
	"npm/internal/logger"

	jsref "github.com/jc21/jsref"
	"github.com/jc21/jsref/provider"
)

var (
	swaggerSchema []byte
	apiDocsSub    fs.FS
)

// Schema simply reads the swagger schema from disk and returns is raw
// Route: GET /schema
func Schema() func(http.ResponseWriter, *http.Request) {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		w.WriteHeader(http.StatusOK)
		fmt.Fprint(w, string(getSchema()))
	}
}

func getSchema() []byte {
	if swaggerSchema == nil {
		apiDocsSub, _ = fs.Sub(embed.APIDocFiles, "api_docs")

		// nolint:gosec
		swaggerSchema, _ = fs.ReadFile(apiDocsSub, "api.swagger.json")

		// Replace {{VERSION}} with Config Version
		swaggerSchema = []byte(strings.ReplaceAll(string(swaggerSchema), "{{VERSION}}", config.Version))

		// Dereference the JSON Schema:
		var schema interface{}
		if err := json.Unmarshal(swaggerSchema, &schema); err != nil {
			logger.Error("SwaggerUnmarshalError", err)
			return nil
		}

		provider := provider.NewIoFS(apiDocsSub, "")
		resolver := jsref.New()
		err := resolver.AddProvider(provider)
		if err != nil {
			logger.Error("SchemaProviderError", err)
		}

		result, err := resolver.Resolve(schema, "", []jsref.Option{jsref.WithRecursiveResolution(true)}...)
		if err != nil {
			logger.Error("SwaggerResolveError", err)
		} else {
			var marshalErr error
			swaggerSchema, marshalErr = json.MarshalIndent(result, "", "  ")
			if marshalErr != nil {
				logger.Error("SwaggerMarshalError", err)
			}
		}
		// End dereference

		// Replace incoming schemas with those we actually use in code
		swaggerSchema = replaceIncomingSchemas(swaggerSchema)
	}
	return swaggerSchema
}

func replaceIncomingSchemas(swaggerSchema []byte) []byte {
	str := string(swaggerSchema)

	// Remember to include the double quotes in the replacement!
	str = strings.ReplaceAll(str, `"{{schema.SetAuth}}"`, schema.SetAuth())
	str = strings.ReplaceAll(str, `"{{schema.GetToken}}"`, schema.GetToken())

	str = strings.ReplaceAll(str, `"{{schema.CreateCertificateAuthority}}"`, schema.CreateCertificateAuthority())
	str = strings.ReplaceAll(str, `"{{schema.UpdateCertificateAuthority}}"`, schema.UpdateCertificateAuthority())

	str = strings.ReplaceAll(str, `"{{schema.CreateCertificate}}"`, schema.CreateCertificate())
	str = strings.ReplaceAll(str, `"{{schema.UpdateCertificate}}"`, schema.UpdateCertificate(""))

	str = strings.ReplaceAll(str, `"{{schema.CreateSetting}}"`, schema.CreateSetting())
	str = strings.ReplaceAll(str, `"{{schema.UpdateSetting}}"`, schema.UpdateSetting())

	str = strings.ReplaceAll(str, `"{{schema.CreateUser}}"`, schema.CreateUser())
	str = strings.ReplaceAll(str, `"{{schema.UpdateUser}}"`, schema.UpdateUser())

	str = strings.ReplaceAll(str, `"{{schema.CreateHost}}"`, schema.CreateHost())
	str = strings.ReplaceAll(str, `"{{schema.UpdateHost}}"`, schema.UpdateHost())

	str = strings.ReplaceAll(str, `"{{schema.CreateNginxTemplate}}"`, schema.CreateNginxTemplate())
	str = strings.ReplaceAll(str, `"{{schema.UpdateNginxTemplate}}"`, schema.UpdateNginxTemplate())

	str = strings.ReplaceAll(str, `"{{schema.CreateStream}}"`, schema.CreateStream())
	str = strings.ReplaceAll(str, `"{{schema.UpdateStream}}"`, schema.UpdateStream())

	str = strings.ReplaceAll(str, `"{{schema.CreateDNSProvider}}"`, schema.CreateDNSProvider())
	str = strings.ReplaceAll(str, `"{{schema.UpdateDNSProvider}}"`, schema.UpdateDNSProvider())

	str = strings.ReplaceAll(str, `"{{schema.CreateUpstream}}"`, schema.CreateUpstream())
	str = strings.ReplaceAll(str, `"{{schema.UpdateUpstream}}"`, schema.UpdateUpstream())

	return []byte(str)
}
