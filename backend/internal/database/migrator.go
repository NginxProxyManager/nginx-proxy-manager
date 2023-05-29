package database

import (
	"fmt"
	"net/url"

	"npm/embed"
	"npm/internal/config"
	"npm/internal/logger"

	"github.com/amacneil/dbmate/v2/pkg/dbmate"
	_ "github.com/amacneil/dbmate/v2/pkg/driver/postgres"
	_ "github.com/amacneil/dbmate/v2/pkg/driver/sqlite"
)

type afterMigrationComplete func()

// Migrate will bring the db up to date
func Migrate(followup afterMigrationComplete) bool {
	dbURL := config.Configuration.DB.GetDBMateConnectURL()
	u, _ := url.Parse(dbURL)
	db := dbmate.New(u)
	db.AutoDumpSchema = false
	db.FS = embed.MigrationFiles
	db.MigrationsDir = []string{fmt.Sprintf("./migrations/%s", config.Configuration.DB.GetDriver())}

	migrations, err := db.FindMigrations()
	if err != nil {
		logger.Error("MigrationError", err)
		return false
	}

	for _, m := range migrations {
		logger.Debug("%s: %s", m.Version, m.FilePath)
	}

	err = db.CreateAndMigrate()
	if err != nil {
		logger.Error("MigrationError", err)
		return false
	}

	followup()
	return true
}
