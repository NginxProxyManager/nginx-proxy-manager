package validator

import (
	"testing"

	"npm/internal/entity/certificate"
	"npm/internal/entity/host"
	"npm/internal/entity/nginxtemplate"
	"npm/internal/entity/upstream"
	"npm/internal/types"

	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

// Mocking the dependencies
type MockCertificate struct {
	mock.Mock
}

func (m *MockCertificate) GetByID(id uint) (certificate.Model, error) {
	args := m.Called(id)
	return args.Get(0).(certificate.Model), args.Error(1)
}

type MockUpstream struct {
	mock.Mock
}

func (m *MockUpstream) GetByID(id uint) (upstream.Model, error) {
	args := m.Called(id)
	return args.Get(0).(upstream.Model), args.Error(1)
}

type MockNginxTemplate struct {
	mock.Mock
}

func (m *MockNginxTemplate) GetByID(id uint) (nginxtemplate.Model, error) {
	args := m.Called(id)
	return args.Get(0).(nginxtemplate.Model), args.Error(1)
}

func TestValidateHost(t *testing.T) {
	tests := []struct {
		name    string
		host    host.Model
		wantErr string
	}{
		{
			name: "valid host with certificate and upstream",
			host: host.Model{
				CertificateID:   types.NullableDBUint{Uint: 1},
				UpstreamID:      types.NullableDBUint{Uint: 1},
				NginxTemplateID: 1,
				Type:            "some-type",
			},
			wantErr: "",
		},
		{
			name: "certificate does not exist",
			host: host.Model{
				CertificateID: types.NullableDBUint{Uint: 9},
			},
			wantErr: "Certificate #9 does not exist: record not found",
		},
		{
			name: "upstream does not exist",
			host: host.Model{
				UpstreamID: types.NullableDBUint{Uint: 9},
			},
			wantErr: "Upstream #9 does not exist: record not found",
		},
		{
			name: "proxy host and port set with upstream",
			host: host.Model{
				UpstreamID: types.NullableDBUint{Uint: 1},
				ProxyHost:  "proxy",
				ProxyPort:  8080,
			},
			wantErr: "Proxy Host or Port cannot be set when using an Upstream",
		},
		{
			name: "proxy host and port not set without upstream",
			host: host.Model{
				ProxyHost: "",
				ProxyPort: 0,
			},
			wantErr: "Proxy Host and Port must be specified, unless using an Upstream",
		},
		{
			name: "nginx template does not exist",
			host: host.Model{
				ProxyHost:       "proxy",
				ProxyPort:       8080,
				NginxTemplateID: 9,
			},
			wantErr: "Host Template #9 does not exist: record not found",
		},
		{
			name: "nginx template type mismatch",
			host: host.Model{
				ProxyHost:       "proxy",
				ProxyPort:       8080,
				NginxTemplateID: 8,
				Type:            "some-type",
			},
			wantErr: "Host Template #8 is not valid for this host type",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			mockCert := new(MockCertificate)
			mockUpstream := new(MockUpstream)
			mockNginxTemplate := new(MockNginxTemplate)

			certificateGetByID = mockCert.GetByID
			upstreamGetByID = mockUpstream.GetByID
			nginxtemplateGetByID = mockNginxTemplate.GetByID

			// id 1 is valid
			mockCert.On("GetByID", uint(1)).Return(certificate.Model{}, nil)
			mockUpstream.On("GetByID", uint(1)).Return(upstream.Model{}, nil)
			mockNginxTemplate.On("GetByID", uint(1)).Return(nginxtemplate.Model{Type: "some-type"}, nil)

			// id 9 is errors
			mockCert.On("GetByID", uint(9)).Return(certificate.Model{}, gorm.ErrRecordNotFound)
			mockUpstream.On("GetByID", uint(9)).Return(upstream.Model{}, gorm.ErrRecordNotFound)
			mockNginxTemplate.On("GetByID", uint(9)).Return(nginxtemplate.Model{}, gorm.ErrRecordNotFound)

			// 8 is special
			mockNginxTemplate.On("GetByID", uint(8)).Return(nginxtemplate.Model{Type: "different-type"}, nil)

			err := ValidateHost(tt.host)
			if tt.wantErr != "" {
				require.NotNil(t, err)
				require.Equal(t, tt.wantErr, err.Error())
			} else {
				require.Nil(t, err)
			}
		})
	}
}
