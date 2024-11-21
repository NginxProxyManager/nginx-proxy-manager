package handler

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"npm/internal/model"

	"github.com/stretchr/testify/assert"
)

func TestGetPageInfoFromRequest(t *testing.T) {
	t.Run("basic test", func(t *testing.T) {
		r := httptest.NewRequest(http.MethodGet, "/hosts", nil)
		p, err := getPageInfoFromRequest(r)

		var nilStringSlice []string
		var nilSortSlice []model.Sort
		defaultSort := model.Sort{Field: "name", Direction: "asc"}

		assert.Equal(t, nil, err)
		assert.Equal(t, 0, p.Offset)
		assert.Equal(t, 10, p.Limit)
		assert.Equal(t, nilStringSlice, p.Expand)
		assert.Equal(t, nilSortSlice, p.Sort)
		assert.Equal(t, []model.Sort{defaultSort}, p.GetSort(defaultSort))
	})
}

func TestGetQueryVarInt(t *testing.T) {
	type want struct {
		val int
		err string
	}

	tests := []struct {
		name         string
		url          string
		queryVar     string
		required     bool
		defaultValue int
		want         want
	}{
		{
			name:         "simple default",
			url:          "/hosts",
			queryVar:     "something",
			required:     false,
			defaultValue: 100,
			want: want{
				val: 100,
				err: "",
			},
		},
		{
			name:     "required flag",
			url:      "/hosts",
			queryVar: "something",
			required: true,
			want: want{
				val: 0,
				err: "something was not supplied in the request",
			},
		},
		{
			name:     "simple get",
			url:      "/hosts?something=50",
			queryVar: "something",
			required: true,
			want: want{
				val: 50,
				err: "",
			},
		},
		{
			name:     "invalid number",
			url:      "/hosts?something=aaa",
			queryVar: "something",
			required: true,
			want: want{
				val: 0,
				err: "",
			},
		},
		{
			name:     "preceding zeros",
			url:      "/hosts?something=0000050",
			queryVar: "something",
			required: true,
			want: want{
				val: 50,
				err: "",
			},
		},
		{
			name:     "decimals",
			url:      "/hosts?something=50.50",
			queryVar: "something",
			required: true,
			want: want{
				val: 0,
				err: "",
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			r := httptest.NewRequest(http.MethodGet, tt.url, nil)
			val, err := getQueryVarInt(r, tt.queryVar, tt.required, tt.defaultValue)
			assert.Equal(t, tt.want.val, val)
			if tt.want.err != "" {
				assert.NotEqual(t, nil, err)
				assert.Equal(t, tt.want.err, err.Error())
			}
		})
	}
}
