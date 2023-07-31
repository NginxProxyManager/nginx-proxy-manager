package config

import (
	"os"
	"strings"
	"testing"

	"npm/internal/logger"

	"github.com/stretchr/testify/assert"
)

func TestInit(t *testing.T) {
	t.Setenv("NPM_DATA_FOLDER", "/path/to/some/data/folder")
	t.Setenv("NPM_LOG_LEVEL", "warn")
	t.Setenv("NPM_DB_DRIVER", "postgres")
	t.Setenv("NPM_DB_HOST", "1.1.1.1")
	t.Setenv("NPM_DB_PORT", "5432")
	t.Setenv("NPM_DB_USERNAME", "rootuser")
	t.Setenv("NPM_DB_PASSWORD", "4metoremember")
	t.Setenv("NPM_DB_NAME", "npm")
	t.Setenv("NPM_DISABLE_IPV4", "false")
	t.Setenv("NPM_DISABLE_IPV6", "true")

	version := "999.999.999"
	commit := "abcd124"
	Init(&version, &commit)
	err := InitIPRanges(&version, &commit)
	assert.Nil(t, err)

	assert.Equal(t, "/path/to/some/data/folder", Configuration.DataFolder)
	assert.Equal(t, false, Configuration.DisableIPV4)
	assert.Equal(t, true, Configuration.DisableIPV6)
	assert.Equal(t, "/data/.acme.sh", Configuration.Acmesh.Home)
	assert.Equal(t, "disable", Configuration.DB.SSLMode)
	assert.Equal(t, logger.WarnLevel, logger.GetLogLevel())

	assert.Equal(t, "postgres", Configuration.DB.Driver)
	assert.Equal(t, "1.1.1.1", Configuration.DB.Host)
	assert.Equal(t, 5432, Configuration.DB.Port)
	assert.Equal(t, "rootuser", Configuration.DB.Username)
	assert.Equal(t, "4metoremember", Configuration.DB.Password)
	assert.Equal(t, "npm", Configuration.DB.Name)
	assert.Equal(t, "postgres", Configuration.DB.GetDriver())
}

func TestConnectURLs(t *testing.T) {
	type want struct {
		gorm   string
		dbmate string
	}

	tests := []struct {
		name string
		envs []string
		want want
	}{
		{
			name: "sqlite",
			envs: []string{
				"NPM_DB_DRIVER=sqlite",
				"NPM_DATA_FOLDER=/path/to/data",
			},
			want: want{
				gorm:   "/path/to/data/nginxproxymanager.db",
				dbmate: "sqlite:/path/to/data/nginxproxymanager.db",
			},
		},
		{
			name: "postgres",
			envs: []string{
				"NPM_DB_DRIVER=postgres",
				"NPM_DB_HOST=2.2.2.2",
				"NPM_DB_PORT=9824",
				"NPM_DB_USERNAME=postgresuser",
				"NPM_DB_PASSWORD=pgpass",
				"NPM_DB_SSLMODE=strict",
				"NPM_DB_NAME=npm",
			},
			want: want{
				gorm:   "host=2.2.2.2 user=postgresuser password=pgpass dbname=npm port=9824 sslmode=strict TimeZone=UTC",
				dbmate: "postgres://postgresuser:pgpass@2.2.2.2:9824/npm?sslmode=strict",
			},
		},
		{
			name: "mysql",
			envs: []string{
				"NPM_DB_DRIVER=mysql",
				"NPM_DB_HOST=3.3.3.3",
				"NPM_DB_PORT=3307",
				"NPM_DB_USERNAME=mysqluser",
				"NPM_DB_PASSWORD=mypass",
				"NPM_DB_NAME=npm",
			},
			want: want{
				gorm:   "mysqluser:mypass@tcp(3.3.3.3:3307)/npm?charset=utf8mb4&parseTime=True&loc=Local",
				dbmate: "mysql://mysqluser:mypass@3.3.3.3:3307/npm",
			},
		},
	}

	version := "888.888.888"
	commit := "abcd125"

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			for _, env := range tt.envs {
				parts := strings.Split(env, "=")
				if len(parts) == 2 {
					t.Setenv(parts[0], parts[1])
				}
			}
			Init(&version, &commit)
			assert.Equal(t, tt.want.gorm, Configuration.DB.GetGormConnectURL())
			assert.Equal(t, tt.want.dbmate, Configuration.DB.GetDBMateConnectURL())
		})
	}
}

func TestCreateDataFolders(t *testing.T) {
	t.Setenv("NPM_DATA_FOLDER", "/tmp/npmtest")

	version := "777.777.777"
	commit := "abcd123"
	Init(&version, &commit)
	CreateDataFolders()

	_, err := os.Stat("/tmp/npmtest/nginx/hosts")
	assert.Nil(t, err)
}
