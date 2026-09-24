package migrations

import (
	"npm/internal/entity"
	"npm/internal/entity/accesslist"
	"npm/internal/entity/auth"
	"npm/internal/entity/certificate"
	"npm/internal/entity/certificateauthority"
	"npm/internal/entity/dnsprovider"
	"npm/internal/entity/host"
	"npm/internal/entity/nginxtemplate"
	"npm/internal/entity/setting"
	"npm/internal/entity/stream"
	"npm/internal/entity/upstream"
	"npm/internal/entity/upstreamserver"
	"npm/internal/entity/user"
	"npm/internal/jwt"
	"npm/internal/model"

	"github.com/go-gormigrate/gormigrate/v2"
	"gorm.io/gorm"
)

// auditLogSchema mirrors the audit_log table. There is no application
// entity for it yet, so its schema is only declared here for AutoMigrate.
type auditLogSchema struct {
	model.Base
	UserID     uint   `gorm:"column:user_id"`
	ObjectType string `gorm:"column:object_type"`
	ObjectID   uint   `gorm:"column:object_id"`
	Action     string `gorm:"column:action"`
	Meta       string `gorm:"column:meta"`
}

// TableName overrides the table name used by gorm
func (auditLogSchema) TableName() string {
	return "audit_log"
}

// initialSchema creates every table used by the application. It replaces
// the hand-written, per-engine SQL that dbmate used to run: gorm's dialect
// drivers already know how to translate these structs for Postgres, MySQL
// and SQLite, so there's no need to maintain three copies of the same DDL.
func initialSchema() *gormigrate.Migration {
	return &gormigrate.Migration{
		ID: "20201013035318",
		Migrate: func(tx *gorm.DB) error {
			return tx.AutoMigrate(
				&jwt.KeysModel{},
				&user.Model{},
				&entity.Capability{},
				&user.HasCapabilityModel{},
				&auth.Model{},
				&setting.Model{},
				&auditLogSchema{},
				&certificateauthority.Model{},
				&dnsprovider.Model{},
				&certificate.Model{},
				&stream.Model{},
				&nginxtemplate.Model{},
				&upstream.Model{},
				&upstreamserver.Model{},
				&accesslist.Model{},
				&host.Model{},
			)
		},
	}
}
