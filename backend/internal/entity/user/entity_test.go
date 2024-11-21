package user

import (
	goerrors "errors"
	"regexp"
	"testing"

	"npm/internal/errors"
	"npm/internal/model"
	"npm/internal/test"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/stretchr/testify/suite"
	"go.uber.org/goleak"
)

// +------------+
// | Setup      |
// +------------+

type testsuite struct {
	suite.Suite
	mock             sqlmock.Sqlmock
	singleRow        *sqlmock.Rows
	capabilitiesRows *sqlmock.Rows
	listCountRows    *sqlmock.Rows
	listRows         *sqlmock.Rows
}

// SetupTest is executed before each test
func (s *testsuite) SetupTest() {
	var err error
	s.mock, err = test.Setup()
	require.NoError(s.T(), err)

	// These rows need to be intantiated for each test as they are
	// read in the db object, and their row position is not resettable
	// between tests.
	s.singleRow = sqlmock.NewRows([]string{
		"id",
		"name",
		"email",
		"is_disabled",
		"is_system",
	}).AddRow(
		10,
		"John Doe",
		"jon@example.com",
		false,
		false,
	)

	s.capabilitiesRows = sqlmock.NewRows([]string{
		"user_id",
		"capability_name",
	}).AddRow(
		10,
		"hosts.view",
	).AddRow(
		10,
		"hosts.manage",
	)

	s.listCountRows = sqlmock.NewRows([]string{
		"count(*)",
	}).AddRow(
		2,
	)

	s.listRows = sqlmock.NewRows([]string{
		"id",
		"name",
		"email",
		"is_disabled",
		"is_system",
	}).AddRow(
		10,
		"John Doe",
		"jon@example.com",
		false,
		false,
	).AddRow(
		11,
		"Jane Doe",
		"jane@example.com",
		true,
		false,
	)
}

// In order for 'go test' to run this suite, we need to create
// a normal test function and pass our suite to suite.Run
func TestExampleTestSuite(t *testing.T) {
	suite.Run(t, new(testsuite))
}

func assertModel(t *testing.T, m Model) {
	assert.Equal(t, uint(10), m.ID)
	assert.Equal(t, "John Doe", m.Name)
	assert.Equal(t, "jon@example.com", m.Email)
	assert.Equal(t, false, m.IsDisabled)
	assert.Equal(t, false, m.IsSystem)
}

// +------------+
// | Tests      |
// +------------+

func (s *testsuite) TestGetByID() {
	// goleak is used to detect goroutine leaks
	defer goleak.VerifyNone(s.T(), goleak.IgnoreAnyFunction("database/sql.(*DB).connectionOpener"))

	s.mock.
		ExpectQuery(regexp.QuoteMeta(`SELECT * FROM "user" WHERE "user"."id" = $1 AND "user"."is_deleted" = $2 ORDER BY "user"."id" LIMIT $3`)).
		WithArgs(10, 0, 1).
		WillReturnRows(s.singleRow)

	m, err := GetByID(10)
	require.NoError(s.T(), err)
	require.NoError(s.T(), s.mock.ExpectationsWereMet())
	assertModel(s.T(), m)
}

func (s *testsuite) TestLoadByEmail() {
	// goleak is used to detect goroutine leaks
	defer goleak.VerifyNone(s.T(), goleak.IgnoreAnyFunction("database/sql.(*DB).connectionOpener"))

	s.mock.
		ExpectQuery(regexp.QuoteMeta(`SELECT * FROM "user" WHERE email = $1 AND is_system = $2 AND "user"."is_deleted" = $3 ORDER BY "user"."id" LIMIT $4`)).
		WithArgs("jon@example.com", false, 0, 1).
		WillReturnRows(s.singleRow)

	m, err := GetByEmail("jon@example.com")
	require.NoError(s.T(), err)
	require.NoError(s.T(), s.mock.ExpectationsWereMet())
	assertModel(s.T(), m)
}

func (s *testsuite) TestIsEnabled() {
	// goleak is used to detect goroutine leaks
	defer goleak.VerifyNone(s.T(), goleak.IgnoreAnyFunction("database/sql.(*DB).connectionOpener"))

	s.mock.
		ExpectQuery(regexp.QuoteMeta(`SELECT * FROM "user" WHERE "user"."id" = $1 AND "user"."is_deleted" = $2 ORDER BY "user"."id" LIMIT $3`)).
		WithArgs(10, 0, 1).
		WillReturnRows(s.singleRow)

	s.mock.
		ExpectQuery(regexp.QuoteMeta(`SELECT * FROM "user" WHERE "user"."id" = $1 AND "user"."is_deleted" = $2 ORDER BY "user"."id" LIMIT $3`)).
		WithArgs(999, 0, 1).
		WillReturnError(goerrors.New("record not found"))

	// user that exists
	exists, enabled, err := IsEnabled(10)
	require.NoError(s.T(), err)
	assert.Equal(s.T(), true, exists)
	assert.Equal(s.T(), true, enabled)
	// that that doesn't exist
	exists, enabled, err = IsEnabled(999)
	assert.Equal(s.T(), "record not found", err.Error())
	assert.Equal(s.T(), false, exists)
	assert.Equal(s.T(), false, enabled)

	require.NoError(s.T(), s.mock.ExpectationsWereMet())
}

func (s *testsuite) TestSave() {
	// goleak is used to detect goroutine leaks
	defer goleak.VerifyNone(s.T(), goleak.IgnoreAnyFunction("database/sql.(*DB).connectionOpener"))

	s.mock.
		ExpectQuery(regexp.QuoteMeta(`SELECT * FROM "user" WHERE email = $1 AND is_system = $2 AND "user"."is_deleted" = $3 ORDER BY "user"."id" LIMIT $4`)).
		WithArgs("jon@example.com", false, 0, 1).
		WillReturnRows(s.singleRow)

	s.mock.ExpectBegin()
	s.mock.ExpectQuery(regexp.QuoteMeta(`INSERT INTO "user" ("created_at","updated_at","is_deleted","name","email","is_disabled","is_system") VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING "id"`)).
		WithArgs(
			sqlmock.AnyArg(),
			sqlmock.AnyArg(),
			0,
			"John Doe",
			"sarah@example.com",
			false,
			false,
		).
		WillReturnRows(sqlmock.NewRows([]string{"id"}).AddRow("11"))
	s.mock.ExpectCommit()

	// New model, as system
	m := Model{
		Name:     "John Doe",
		Email:    "JON@example.com", // mixed case on purpose
		IsSystem: true,
	}
	err := m.Save()
	assert.Equal(s.T(), errors.ErrSystemUserReadonly.Error(), err.Error())

	// Remove system and try again. Expect error due to duplicate email
	m.IsSystem = false
	err = m.Save()
	assert.Equal(s.T(), errors.ErrDuplicateEmailUser.Error(), err.Error())

	// Change email and try again. Expect success
	m.Email = "sarah@example.com"
	err = m.Save()
	require.NoError(s.T(), err)
	require.NoError(s.T(), s.mock.ExpectationsWereMet())
}

func (s *testsuite) TestDelete() {
	// goleak is used to detect goroutine leaks
	defer goleak.VerifyNone(s.T(), goleak.IgnoreAnyFunction("database/sql.(*DB).connectionOpener"))

	s.mock.ExpectBegin()
	s.mock.
		ExpectExec(regexp.QuoteMeta(`UPDATE "user" SET "is_deleted"=$1 WHERE "user"."id" = $2 AND "user"."is_deleted" = $3`)).
		WithArgs(1, 10, 0).
		WillReturnResult(sqlmock.NewResult(0, 1))
	s.mock.ExpectCommit()

	m := Model{}
	err := m.Delete()
	assert.Equal(s.T(), "Unable to delete a new object", err.Error())

	m2 := Model{
		Base: model.Base{
			ID: 10,
		},
		Name: "John Doe",
	}
	err2 := m2.Delete()
	require.NoError(s.T(), err2)
	require.NoError(s.T(), s.mock.ExpectationsWereMet())
}

func (s *testsuite) TestGenerateGravatar() {
	// goleak is used to detect goroutine leaks
	defer goleak.VerifyNone(s.T(), goleak.IgnoreAnyFunction("database/sql.(*DB).connectionOpener"))

	m := Model{Email: "jon@example.com"}
	m.generateGravatar()
	assert.Equal(s.T(), "https://www.gravatar.com/avatar/dc36565cc2376197358fa27ed4c47253?d=mm&r=pg&s=128", m.GravatarURL)
}

func (s *testsuite) TestDeleteAll() {
	// goleak is used to detect goroutine leaks
	defer goleak.VerifyNone(s.T(), goleak.IgnoreAnyFunction("database/sql.(*DB).connectionOpener"))

	s.mock.
		ExpectExec(regexp.QuoteMeta(`DELETE FROM "user" WHERE is_system = $1`)).
		WithArgs(false).
		WillReturnResult(sqlmock.NewResult(0, 1))

	s.mock.
		ExpectExec(regexp.QuoteMeta(`DELETE FROM "auth"`)).
		WillReturnResult(sqlmock.NewResult(0, 1))

	err := DeleteAll()
	require.NoError(s.T(), err)
	require.NoError(s.T(), s.mock.ExpectationsWereMet())
}

func (s *testsuite) TestGetCapabilities() {
	// goleak is used to detect goroutine leaks
	defer goleak.VerifyNone(s.T(), goleak.IgnoreAnyFunction("database/sql.(*DB).connectionOpener"))

	s.mock.
		ExpectQuery(regexp.QuoteMeta(`SELECT * FROM "user_has_capability" WHERE user_id = $1`)).
		WithArgs(10).
		WillReturnRows(s.capabilitiesRows)

	s.mock.
		ExpectQuery(regexp.QuoteMeta(`SELECT * FROM "user_has_capability" WHERE user_id = $1`)).
		WithArgs(999).
		WillReturnRows(sqlmock.NewRows([]string{}))

	s.mock.
		ExpectQuery(regexp.QuoteMeta(`SELECT * FROM "user_has_capability" WHERE user_id = $1`)).
		WithArgs(1000).
		WillReturnError(goerrors.New("some other error"))

	// user that exists
	caps, err := GetCapabilities(10)
	require.NoError(s.T(), err)
	assert.Equal(s.T(), 2, len(caps))
	// user that doesn't exist
	caps, err = GetCapabilities(999)
	require.NoError(s.T(), err)
	assert.Equal(s.T(), 0, len(caps))
	// some other error
	caps, err = GetCapabilities(1000)
	assert.Equal(s.T(), "some other error", err.Error())
	assert.Equal(s.T(), 0, len(caps))

	require.NoError(s.T(), s.mock.ExpectationsWereMet())
}

func (s *testsuite) TestList() {
	// goleak is used to detect goroutine leaks
	defer goleak.VerifyNone(s.T(), goleak.IgnoreAnyFunction("database/sql.(*DB).connectionOpener"))

	s.mock.
		ExpectQuery(regexp.QuoteMeta(`SELECT count(*) FROM "user" WHERE "user"."name" LIKE $1 AND "user"."is_deleted" = $2`)).
		WithArgs("%jon%", 0).
		WillReturnRows(s.listCountRows)

	s.mock.
		ExpectQuery(regexp.QuoteMeta(`SELECT * FROM "user" WHERE "user"."name" LIKE $1 AND "user"."is_deleted" = $2 ORDER BY name asc LIMIT $3`)).
		WithArgs("%jon%", 0, 8).
		WillReturnRows(s.listRows)

	s.mock.
		ExpectQuery(regexp.QuoteMeta(`SELECT * FROM "user_has_capability" WHERE user_id = $1`)).
		WithArgs(10).
		WillReturnRows(s.capabilitiesRows)

	s.mock.
		ExpectQuery(regexp.QuoteMeta(`SELECT * FROM "user_has_capability" WHERE user_id = $1`)).
		WithArgs(11).
		WillReturnRows(sqlmock.NewRows([]string{}))

	p := model.PageInfo{
		Offset: 0,
		Limit:  8,
		Sort: []model.Sort{
			{
				Field:     "name",
				Direction: "asc",
			},
		},
	}

	f := []model.Filter{
		{
			Field:    "name",
			Modifier: "contains",
			Value:    []string{"jon"},
		},
	}

	e := []string{"capabilities"}

	resp, err := List(p, f, e)
	require.NoError(s.T(), err)
	assert.Equal(s.T(), int64(2), resp.Total)
	assert.Equal(s.T(), p.Offset, resp.Offset)
	assert.Equal(s.T(), p.Limit, resp.Limit)
	assert.Equal(s.T(), p.Limit, resp.Limit)
	assert.Equal(s.T(), p.Sort, resp.Sort)
	assert.Equal(s.T(), f, resp.Filter)

	require.NoError(s.T(), s.mock.ExpectationsWereMet())
}

func (s *testsuite) TestSetPermissions() {
	// goleak is used to detect goroutine leaks
	defer goleak.VerifyNone(s.T(), goleak.IgnoreAnyFunction("database/sql.(*DB).connectionOpener"))

	s.mock.ExpectBegin()
	s.mock.
		ExpectExec(regexp.QuoteMeta(`DELETE FROM "user_has_capability" WHERE user_id = $1`)).
		WithArgs(10).
		WillReturnResult(sqlmock.NewResult(0, 1))
	s.mock.ExpectCommit()

	s.mock.ExpectBegin()
	s.mock.
		ExpectExec(regexp.QuoteMeta(`INSERT INTO "user_has_capability" ("user_id","capability_name") VALUES ($1,$2),($3,$4)`)).
		WithArgs(10, "hosts.view", 10, "hosts.manage").
		WillReturnResult(sqlmock.NewResult(88, 0))
	s.mock.ExpectCommit()

	// Empty model returns error
	m := Model{}
	err := m.SetPermissions([]string{"hosts.view", "hosts.manage"})
	assert.Equal(s.T(), "Cannot set permissions without first saving the User", err.Error())

	// Defined user
	m.ID = 10
	err = m.SetPermissions([]string{"hosts.view", "hosts.manage"})
	require.NoError(s.T(), err)

	require.NoError(s.T(), s.mock.ExpectationsWereMet())
}

func (s *testsuite) TestSaveCapabilities() {
	// goleak is used to detect goroutine leaks
	defer goleak.VerifyNone(s.T(), goleak.IgnoreAnyFunction("database/sql.(*DB).connectionOpener"))

	s.mock.
		ExpectQuery(regexp.QuoteMeta(`SELECT * FROM "capability"`)).
		WillReturnRows(sqlmock.NewRows([]string{"name"}).
			AddRow("full-admin").
			AddRow("hosts.view").
			AddRow("hosts.manage"))

	s.mock.ExpectBegin()
	s.mock.
		ExpectExec(regexp.QuoteMeta(`DELETE FROM "user_has_capability" WHERE user_id = $1`)).
		WithArgs(10).
		WillReturnResult(sqlmock.NewResult(0, 1))
	s.mock.ExpectCommit()

	s.mock.ExpectBegin()
	s.mock.
		ExpectExec(regexp.QuoteMeta(`INSERT INTO "user_has_capability" ("user_id","capability_name") VALUES ($1,$2),($3,$4)`)).
		WithArgs(10, "hosts.view", 10, "hosts.manage").
		WillReturnResult(sqlmock.NewResult(88, 0))
	s.mock.ExpectCommit()

	// Empty model returns error
	m := Model{}
	err := m.SaveCapabilities()
	assert.Equal(s.T(), "Cannot save capabilities on unsaved user", err.Error())

	// Empty model returns error
	m.ID = 10
	err = m.SaveCapabilities()
	assert.Equal(s.T(), "At least 1 capability required for a user", err.Error())

	// With some caps
	m.Capabilities = []string{"hosts.view", "hosts.manage"}
	err = m.SaveCapabilities()
	require.NoError(s.T(), err)

	require.NoError(s.T(), s.mock.ExpectationsWereMet())
}

func (s *testsuite) TestSaveCapabilitiesInvalid() {
	// goleak is used to detect goroutine leaks
	defer goleak.VerifyNone(s.T(), goleak.IgnoreAnyFunction("database/sql.(*DB).connectionOpener"))

	s.mock.
		ExpectQuery(regexp.QuoteMeta(`SELECT * FROM "capability"`)).
		WillReturnRows(sqlmock.NewRows([]string{"name"}).
			AddRow("full-admin").
			AddRow("hosts.view").
			AddRow("hosts.manage"))

	// Empty model returns error
	m := Model{
		Base: model.Base{
			ID: 10,
		},
		Capabilities: []string{"doesnotexist", "hosts.manage"},
	}
	err := m.SaveCapabilities()
	assert.Equal(s.T(), "Capability `doesnotexist` is not valid", err.Error())

	require.NoError(s.T(), s.mock.ExpectationsWereMet())
}
