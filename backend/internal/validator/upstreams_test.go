package validator

import (
	"testing"

	"npm/internal/entity/nginxtemplate"
	"npm/internal/entity/upstream"
	"npm/internal/entity/upstreamserver"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func TestValidateUpstream(t *testing.T) {
	tests := []struct {
		name          string
		upstreamModel upstream.Model
		expectedError string
	}{
		{
			name: "less than 2 servers",
			upstreamModel: upstream.Model{
				Servers: []upstreamserver.Model{
					{Server: "192.168.1.1"},
				},
			},
			expectedError: "Upstreams require at least 2 servers",
		},
		{
			name: "backup server with IP hash",
			upstreamModel: upstream.Model{
				Servers: []upstreamserver.Model{
					{Server: "192.168.1.1", Backup: true},
					{Server: "192.168.1.2"},
				},
				IPHash: true,
			},
			expectedError: "Backup servers cannot be used with hash balancing",
		},
		{
			name: "nginx template does not exist",
			upstreamModel: upstream.Model{
				Servers: []upstreamserver.Model{
					{Server: "192.168.1.1"},
					{Server: "192.168.1.2"},
				},
				NginxTemplateID: 999,
			},
			expectedError: "Nginx Template #999 does not exist",
		},
		{
			name: "nginx template type mismatch",
			upstreamModel: upstream.Model{
				Servers: []upstreamserver.Model{
					{Server: "192.168.1.1"},
					{Server: "192.168.1.2"},
				},
				NginxTemplateID: 2,
			},
			expectedError: "Host Template #2 is not valid for this upstream",
		},
		{
			name: "valid upstream",
			upstreamModel: upstream.Model{
				Servers: []upstreamserver.Model{
					{Server: "192.168.1.1"},
					{Server: "192.168.1.2"},
				},
				NginxTemplateID: 1,
			},
			expectedError: "",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			mockNginxTemplate := new(MockNginxTemplate)
			nginxtemplateGetByID = mockNginxTemplate.GetByID

			mockNginxTemplate.On("GetByID", uint(1)).Return(nginxtemplate.Model{Type: "upstream"}, nil)
			mockNginxTemplate.On("GetByID", uint(2)).Return(nginxtemplate.Model{Type: "redirect"}, nil)
			mockNginxTemplate.On("GetByID", uint(999)).Return(nginxtemplate.Model{}, gorm.ErrRecordNotFound)

			err := ValidateUpstream(tt.upstreamModel)
			if tt.expectedError != "" {
				require.NotNil(t, err)
				assert.Equal(t, tt.expectedError, err.Error())
			} else {
				assert.NoError(t, err)
			}
		})
	}
}
