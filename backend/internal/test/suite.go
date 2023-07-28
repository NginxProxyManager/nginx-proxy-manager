package test

import (
	"npm/internal/config"
	"npm/internal/database"
	"strings"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

func Setup() (sqlmock.Sqlmock, error) {
	db, mock, err := sqlmock.New()
	if err != nil {
		return nil, err
	}
	dialector := postgres.New(postgres.Config{
		Conn:       db,
		DriverName: "postgres",
	})
	gormDB, err := gorm.Open(dialector, &gorm.Config{})
	database.SetDB(gormDB)
	return mock, err
}

func InitConfig(t *testing.T, envs ...string) {
	if len(envs) > 0 {
		for _, env := range envs {
			parts := strings.Split(env, "=")
			if len(parts) == 2 {
				t.Setenv(parts[0], parts[1])
			}
		}
	}

	version := "999.999.999"
	commit := "abcd123"
	config.Init(&version, &commit)
}
