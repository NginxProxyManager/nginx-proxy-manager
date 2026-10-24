package user

import (
	"errors"
	"fmt"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
	"npm/internal/database"
	"npm/internal/entity"
	"npm/internal/entity/auth"
	"npm/internal/entity/sso"
	"npm/internal/logger"
	"npm/internal/model"
)

// GetByID finds a user by ID
func GetByID(id uint) (Model, error) { return GetByIDInTx(database.GetDB(), id) }

// GetByIDInTx reads through the caller's transaction. Authorization-affecting
// mutations must acquire the policy fence before loading the user.
func GetByIDInTx(tx *gorm.DB, id uint) (Model, error) {
	var m Model
	err := tx.First(&m, id).Error
	m.generateGravatar()
	return m, err
}

// GetOrCreateSSO must run within the policy-fenced caller's transaction. The
// unique nullable normalized identity resolves concurrent first logins without
// creating a credential or granting capabilities.
func GetOrCreateSSO(tx *gorm.DB, email, name string) (Model, bool, error) {
	normalized, err := sso.NormalizeEmail(email)
	if err != nil {
		return Model{}, false, err
	}
	var value Model
	lookup := func(lock bool) error {
		query := tx.Where("normalized_email = ?", normalized)
		if lock {
			// A locking read sees a concurrent winner even under MySQL's
			// repeatable-read snapshot. Only lock after a conflict: locking a
			// missing key takes gap locks and deadlocks simultaneous inserts.
			query = query.Clauses(clause.Locking{Strength: "UPDATE"})
		}
		return query.First(&value).Error
	}
	if err := lookup(false); err == nil {
		if err := lookup(true); err != nil {
			return Model{}, false, err
		}
		if value.IsDisabled {
			return Model{}, false, fmt.Errorf("SSO user disabled")
		}
		return value, false, nil
	} else if !errors.Is(err, gorm.ErrRecordNotFound) {
		return Model{}, false, err
	}
	value = Model{Email: normalized, Name: name, NormalizedEmail: &normalized, CredentialOrigin: "sso", Capabilities: []string{}}
	result := tx.Clauses(clause.OnConflict{DoNothing: true}).Create(&value)
	if result.Error != nil {
		return Model{}, false, result.Error
	}
	created := result.RowsAffected == 1
	if !created {
		if err := lookup(true); err != nil {
			return Model{}, false, err
		}
	}
	if value.IsDisabled {
		return Model{}, false, fmt.Errorf("SSO user disabled")
	}
	return value, created, nil
}

// GetByEmail finds a user by email
func GetByEmail(email string) (Model, error) {
	var m Model
	err := m.LoadByEmail(email)
	return m, err
}

// IsEnabled is used by middleware to ensure the user is still enabled
// returns (userExist, isEnabled, error)
func IsEnabled(userID uint) (bool, bool, error) {
	var user Model
	db := database.GetDB()
	if result := db.First(&user, userID); result.Error != nil {
		return false, false, result.Error
	}
	return true, !user.IsDisabled, nil
}

// List will return a list of users
func List(pageInfo model.PageInfo, filters []model.Filter, expand []string) (entity.ListResponse, error) {
	var result entity.ListResponse

	defaultSort := model.Sort{
		Field:     "name",
		Direction: "ASC",
	}

	dbo := entity.ListQueryBuilder(&pageInfo, filters, entity.GetFilterMap(Model{}, true))

	// Get count of items in this search
	var totalRows int64
	if res := dbo.Model(&Model{}).Count(&totalRows); res.Error != nil {
		return result, res.Error
	}

	// Get rows
	dbo = entity.AddOffsetLimitToList(dbo, &pageInfo)
	dbo = entity.AddOrderToList(dbo, pageInfo.Sort, defaultSort)
	items := make([]Model, 0)
	if res := dbo.Find(&items); res.Error != nil {
		return result, res.Error
	}

	for idx := range items {
		items[idx].generateGravatar()
	}

	if expand != nil {
		for idx := range items {
			expandErr := items[idx].Expand(expand)
			if expandErr != nil {
				logger.Error("UsersExpansionError", expandErr)
			}
		}
	}

	result = entity.ListResponse{
		Items:  items,
		Total:  totalRows,
		Limit:  pageInfo.Limit,
		Offset: pageInfo.Offset,
		Sort:   pageInfo.GetSort(defaultSort),
		Filter: filters,
	}

	return result, nil
}

// DeleteAll will do just that, and should only be used for testing purposes.
func DeleteAll() error { return DeleteAllInTx(database.GetDB()) }

func DeleteAllInTx(db *gorm.DB) error {
	result := db.Exec(
		fmt.Sprintf(`DELETE FROM %s WHERE is_system = ?`, database.QuoteTableName("user")),
		false,
	)
	if result.Error != nil {
		return result.Error
	}

	result = db.Exec(fmt.Sprintf(`DELETE FROM %s`, database.QuoteTableName("auth")))
	if result.Error != nil {
		return result.Error
	}

	return nil
}

// GetCapabilities gets capabilities for a user
func GetCapabilities(userID uint) ([]string, error) {
	return GetCapabilitiesInTx(database.GetDB(), userID)
}

// GetCapabilitiesInTx returns current permissions from the caller's transaction.
func GetCapabilitiesInTx(db *gorm.DB, userID uint) ([]string, error) {
	capabilities := make([]string, 0)
	var hasCapabilities []HasCapabilityModel
	if result := db.Where("user_id = ?", userID).Find(&hasCapabilities); result.Error != nil {
		return nil, result.Error
	}
	for _, obj := range hasCapabilities {
		capabilities = append(capabilities, obj.CapabilityName)
	}
	return capabilities, nil
}

// PopulateAccessFieldsInTx fills the policy and credential status exposed by
// the user administration DTO. Credential secrets and origin remain private.
func (m *Model) PopulateAccessFieldsInTx(db *gorm.DB) error {
	var err error
	m.Capabilities, err = GetCapabilitiesInTx(db, m.ID)
	if err != nil {
		return err
	}
	var count int64
	if err = db.Model(&auth.Model{}).
		Where("user_id = ? AND type = ?", m.ID, auth.TypeLocal).
		Count(&count).Error; err != nil {
		return err
	}
	m.HasLocalCredential = count > 0
	m.CanSetLocalPassword = !m.IsSystem
	return nil
}

// CreateFromLDAPUser will create a user from an LDAP user object
func CreateFromLDAPUser(ldapUser *auth.LDAPUser) (Model, error) {
	user := Model{
		Email: ldapUser.Email,
		Name:  ldapUser.Name,
	}
	err := user.Save()
	user.generateGravatar()
	return user, err
}

// CreateFromOAuthUser will create a user from an OAuth user object
func CreateFromOAuthUser(ou *auth.OAuthUser) (Model, error) {
	user := Model{
		Email: ou.GetEmail(),
		Name:  ou.GetName(),
	}
	err := user.Save()
	user.generateGravatar()
	return user, err
}
