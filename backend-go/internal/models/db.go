package models

import (
	"fmt"
	"log"
	"os"
	"time"

	"gorm.io/driver/mysql"
	"gorm.io/driver/postgres"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

// DB is the global database connection instance
var DB *gorm.DB

// InitDB initializes the database connection and runs auto-migrations
func InitDB() error {
	var err error
	var dialect gorm.Dialector

	dbType := os.Getenv("DB_MYSQL_HOST")
	dbPG := os.Getenv("DB_POSTGRES_HOST")

	// Determine dialect based on environment variables roughly matching Node.js setup
	if dbType != "" {
		dsn := fmt.Sprintf("%s:%s@tcp(%s:%s)/%s?charset=utf8mb4&parseTime=True&loc=Local",
			os.Getenv("DB_MYSQL_USER"),
			os.Getenv("DB_MYSQL_PASSWORD"),
			dbType,
			getEnvOrDefault("DB_MYSQL_PORT", "3306"),
			os.Getenv("DB_MYSQL_NAME"),
		)
		dialect = mysql.Open(dsn)
	} else if dbPG != "" {
		dsn := fmt.Sprintf("host=%s user=%s password=%s dbname=%s port=%s sslmode=disable TimeZone=UTC",
			dbPG,
			os.Getenv("DB_POSTGRES_USER"),
			os.Getenv("DB_POSTGRES_PASSWORD"),
			os.Getenv("DB_POSTGRES_NAME"),
			getEnvOrDefault("DB_POSTGRES_PORT", "5432"),
		)
		dialect = postgres.Open(dsn)
	} else {
		// Default to SQLite
		dbFile := getEnvOrDefault("DB_SQLITE_FILE", "./data/database.sqlite")
		dialect = sqlite.Open(dbFile)
	}

	newLogger := logger.New(
		log.New(os.Stdout, "\r\n", log.LstdFlags),
		logger.Config{
			SlowThreshold:             time.Second,
			LogLevel:                  logger.Warn,
			IgnoreRecordNotFoundError: true,
			Colorful:                  true,
		},
	)

	DB, err = gorm.Open(dialect, &gorm.Config{
		Logger: newLogger,
	})
	if err != nil {
		return fmt.Errorf("failed to connect database: %w", err)
	}

	// Run Auto-Migrations
	err = DB.AutoMigrate(
		&User{},
		&UserPermission{},
		&Auth{},
		&ProxyHost{},
		&RedirectionHost{},
		&DeadHost{},
		&Stream{},
		&AccessList{},
		&AccessListAuth{},
		&AccessListClient{},
		&Certificate{},
		&AuditLog{},
		&Setting{},
	)
	if err != nil {
		return fmt.Errorf("failed to auto-migrate database: %w", err)
	}

	return nil
}

func getEnvOrDefault(key, fallback string) string {
	if value, exists := os.LookupEnv(key); exists {
		return value
	}
	return fallback
}
