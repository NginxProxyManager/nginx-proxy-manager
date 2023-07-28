package nginx

import (
	"npm/internal/entity/host"
	"npm/internal/model"
	"npm/internal/test"
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestGetHostFilename(t *testing.T) {
	test.InitConfig(t)
	tests := []struct {
		name   string
		host   host.Model
		append string
		want   string
	}{
		{
			"test1",
			host.Model{
				ModelBase: model.ModelBase{
					ID: 10,
				},
			},
			"",
			"/data/nginx/hosts/host_10.conf",
		},
		{
			"test2",
			host.Model{
				ModelBase: model.ModelBase{
					ID: 10,
				},
			},
			".deleted",
			"/data/nginx/hosts/host_10.conf.deleted",
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			filename := getHostFilename(tt.host, tt.append)
			assert.Equal(t, tt.want, filename)
		})
	}
}
