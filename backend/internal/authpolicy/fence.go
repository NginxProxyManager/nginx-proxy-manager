package authpolicy

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"

	"gorm.io/gorm"
	"npm/internal/database"
)

// WithWrite serializes policy mutations, session admission and delivery across
// processes. Callers must not nest fences. Only lock acquisition is retried;
// callbacks can have external effects and are never replayed.
func WithWrite(ctx context.Context, fn func(tx *gorm.DB) error) error {
	return withWrite(ctx, database.GetDB(), fn)
}

func withWrite(ctx context.Context, db *gorm.DB, fn func(*gorm.DB) error) error {
	if db == nil || fn == nil {
		return errors.New("policy fence unavailable")
	}
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	return db.WithContext(ctx).Connection(func(conn *gorm.DB) error {
		conn = conn.Session(&gorm.Session{NewDB: true})
		isSQLite := db.Dialector.Name() == "sqlite"
		if isSQLite {
			var previous int
			if err := conn.Raw("PRAGMA busy_timeout").Scan(&previous).Error; err != nil {
				return err
			}
			if err := conn.Exec("PRAGMA busy_timeout = 0").Error; err != nil {
				return err
			}
			defer conn.WithContext(context.WithoutCancel(ctx)).Exec("PRAGMA busy_timeout = " + fmt.Sprint(previous))
		}
		for {
			if err := ctx.Err(); err != nil {
				return err
			}
			acquired := false
			err := func() error {
				// database/sql otherwise rolls back on context cancellation, which
				// could release the fence while a protected write is still running.
				var tx *gorm.DB
				if isSQLite {
					if err := conn.Exec("BEGIN IMMEDIATE").Error; err != nil {
						return err
					}
					tx = conn.Session(&gorm.Session{NewDB: true, SkipDefaultTransaction: true}).WithContext(context.WithoutCancel(ctx))
					tx.Statement.ConnPool = &sqliteTransaction{ConnPool: conn.Statement.ConnPool, ctx: ctx}
				} else {
					tx = conn.WithContext(context.WithoutCancel(ctx)).Begin(&sql.TxOptions{Isolation: sql.LevelReadCommitted})
					if tx.Error != nil {
						return tx.Error
					}
				}
				defer tx.Rollback()
				active := tx.WithContext(ctx)
				result := active.Table("auth_policy_fence").Where("id = ?", 1).UpdateColumn("revision", gorm.Expr("revision + 1"))
				if result.Error != nil {
					return result.Error
				}
				if result.RowsAffected != 1 {
					return errors.New("policy fence missing")
				}
				// Mark acquisition before invoking the callback: a callback's
				// SQLITE_BUSY is an error, never permission to replay delivery.
				acquired = true
				if err := fn(active); err != nil {
					return err
				}
				if err := ctx.Err(); err != nil {
					return err
				}
				return tx.Commit().Error
			}()
			if acquired || !isSQLite || !sqliteBusy(err) {
				return err
			}
			timer := time.NewTimer(10 * time.Millisecond)
			select {
			case <-ctx.Done():
				timer.Stop()
				return ctx.Err()
			case <-timer.C:
			}
		}
	})
}

// SQLite's immediate transaction obtains its write reservation before any
// reads. In rollback-journal mode, COMMIT can still meet unrelated readers;
// retry the commit itself, never the already-executed callback.
type sqliteTransaction struct {
	gorm.ConnPool
	ctx      context.Context
	finished bool
}

func (tx *sqliteTransaction) Commit() error {
	for {
		if err := tx.ctx.Err(); err != nil {
			return err
		}
		_, err := tx.ExecContext(tx.ctx, "COMMIT")
		if err == nil {
			tx.finished = true
			return nil
		}
		if !sqliteBusy(err) {
			return err
		}
		timer := time.NewTimer(10 * time.Millisecond)
		select {
		case <-tx.ctx.Done():
			timer.Stop()
			return tx.ctx.Err()
		case <-timer.C:
		}
	}
}

func (tx *sqliteTransaction) Rollback() error {
	if tx.finished {
		return nil
	}
	_, err := tx.ExecContext(context.WithoutCancel(tx.ctx), "ROLLBACK")
	if err == nil {
		tx.finished = true
	}
	return err
}

func sqliteBusy(err error) bool {
	var coded interface{ Code() int }
	return errors.As(err, &coded) && (coded.Code()&255 == 5 || coded.Code()&255 == 6)
}
