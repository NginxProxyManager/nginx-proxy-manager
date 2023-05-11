package model

// CloudfrontIPRangePrefix is used within config for cloudfront
type CloudfrontIPRangeV4Prefix struct {
	Value string `json:"ip_prefix"`
}

// CloudfrontIPRangeV6Prefix is used within config for cloudfront
type CloudfrontIPRangeV6Prefix struct {
	Value string `json:"ipv6_prefix"`
}

// CloudfrontIPRanges is the main config for cloudfront
type CloudfrontIPRanges struct {
	IPV4Prefixes []CloudfrontIPRangeV4Prefix `json:"prefixes"`
	IPV6Prefixes []CloudfrontIPRangeV6Prefix `json:"ipv6_prefixes"`
}
