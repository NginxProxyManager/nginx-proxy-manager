package schema

const ssoConfig = `{
  "type":"object", "additionalProperties":false,
  "properties":{
    "issuer_url":{"type":"string"}, "client_id":{"type":"string"},
    "scopes":{"type":"array","items":{"type":"string"},"uniqueItems":true},
    "authorization_url":{"type":"string"}, "token_url":{"type":"string"},
    "userinfo_url":{"type":"string"}, "email_claim":{"type":"string"},
    "name_claim":{"type":"string"}, "subject_claim":{"type":"string"},
    "use_userinfo":{"type":"boolean"},
    "token_auth_method":{"type":"string","enum":["client_secret_basic","client_secret_post"]},
    "idp_metadata_url":{"type":"string"}, "idp_metadata_xml":{"type":"string"},
    "sp_entity_id":{"type":"string"}, "email_attribute":{"type":"string"},
    "name_attribute":{"type":"string"}, "email_name_id":{"type":"boolean"},
    "sign_requests":{"type":"boolean"}
  }
}`

func SSOPolicy() string {
	return `{
  "type":"object","additionalProperties":false,
  "required":["revision","mode","public_url"],
  "properties":{
    "revision":{"type":"integer","minimum":1},
    "mode":{"type":"string","enum":["parallel","sso_only"]},
    "public_url":{"type":"string"}
  }
}`
}

func SSOConnectionCreate() string { return ssoConnection(false) }
func SSOConnectionUpdate() string { return ssoConnection(true) }

func ssoConnection(update bool) string {
	revision := ""
	required := `"protocol","name","enabled","config","secret_action"`
	if update {
		revision = `,"revision":{"type":"integer","minimum":1}`
		required = `"revision",` + required
	}
	return `{"type":"object","additionalProperties":false,"required":[` + required + `],"properties":{
    "protocol":{"type":"string","enum":["oidc","oauth2","saml"]},
    "name":{"type":"string","minLength":1,"maxLength":191},
    "enabled":{"type":"boolean"},
    "config":` + ssoConfig + `,
    "secret_action":{"type":"string","enum":["keep","replace","clear"]},
    "secret_value":{"type":"string","minLength":1}` + revision + `}}`
}

func SSOAllowlist() string {
	return `{
  "type":"object","additionalProperties":false,"required":["revision","emails"],
  "properties":{
    "revision":{"type":"integer","minimum":1},
    "emails":{"type":"array","uniqueItems":true,"items":{"type":"string","maxLength":254,"pattern":"^[^@\\s<>*,;]+@[^@\\s<>*,;]+\\.[^@\\s<>*,;]+$"}}
  }
}`
}

func SSODelete() string {
	return `{"type":"object","additionalProperties":false,"required":["revision"],"properties":{"revision":{"type":"integer","minimum":1}}}`
}
