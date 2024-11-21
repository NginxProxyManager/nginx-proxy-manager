package auth

import (
	"regexp"
	"testing"

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
	mock      sqlmock.Sqlmock
	singleRow *sqlmock.Rows
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
		"user_id",
		"type",
		"secret",
	}).AddRow(
		10,
		100,
		TypeLocal,
		"abc123",
	)
}

// In order for 'go test' to run this suite, we need to create
// a normal test function and pass our suite to suite.Run
func TestExampleTestSuite(t *testing.T) {
	suite.Run(t, new(testsuite))
}

func assertModel(t *testing.T, m Model) {
	assert.Equal(t, uint(10), m.ID)
	assert.Equal(t, uint(100), m.UserID)
	assert.Equal(t, TypeLocal, m.Type)
	assert.Equal(t, "abc123", m.Secret)
}

// +------------+
// | Tests      |
// +------------+

func (s *testsuite) TestGetByID() {
	// goleak is used to detect goroutine leaks
	defer goleak.VerifyNone(s.T(), goleak.IgnoreAnyFunction("database/sql.(*DB).connectionOpener"))

	s.mock.
		ExpectQuery(regexp.QuoteMeta(`SELECT * FROM "auth" WHERE "auth"."id" = $1 AND "auth"."is_deleted" = $2 ORDER BY "auth"."id" LIMIT $3`)).
		WithArgs(10, 0, 1).
		WillReturnRows(s.singleRow)

	m, err := GetByID(10)
	require.NoError(s.T(), err)
	require.NoError(s.T(), s.mock.ExpectationsWereMet())
	assertModel(s.T(), m)
}

func (s *testsuite) TestGetByUserIDType() {
	// goleak is used to detect goroutine leaks
	defer goleak.VerifyNone(s.T(), goleak.IgnoreAnyFunction("database/sql.(*DB).connectionOpener"))

	s.mock.
		ExpectQuery(regexp.QuoteMeta(`SELECT * FROM "auth" WHERE user_id = $1 AND type = $2 AND "auth"."is_deleted" = $3 ORDER BY "auth"."id" LIMIT $4`)).
		WithArgs(100, TypeLocal, 0, 1).
		WillReturnRows(s.singleRow)

	m, err := GetByUserIDType(100, TypeLocal)
	require.NoError(s.T(), err)
	require.NoError(s.T(), s.mock.ExpectationsWereMet())
	assertModel(s.T(), m)
}

func (s *testsuite) TestGetByIdenityType() {
	// goleak is used to detect goroutine leaks
	defer goleak.VerifyNone(s.T(), goleak.IgnoreAnyFunction("database/sql.(*DB).connectionOpener"))

	s.mock.
		ExpectQuery(regexp.QuoteMeta(`SELECT * FROM "auth" WHERE identity = $1 AND type = $2 AND "auth"."is_deleted" = $3 ORDER BY "auth"."id" LIMIT $4`)).
		WithArgs("johndoe", TypeLocal, 0, 1).
		WillReturnRows(s.singleRow)

	m, err := GetByIdenityType("johndoe", TypeLocal)
	require.NoError(s.T(), err)
	require.NoError(s.T(), s.mock.ExpectationsWereMet())
	assertModel(s.T(), m)
}

func (s *testsuite) TestSave() {
	// goleak is used to detect goroutine leaks
	defer goleak.VerifyNone(s.T(), goleak.IgnoreAnyFunction("database/sql.(*DB).connectionOpener"))

	s.mock.ExpectBegin()
	s.mock.ExpectQuery(regexp.QuoteMeta(`INSERT INTO "auth" ("created_at","updated_at","is_deleted","user_id","type","identity","secret") VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING "id"`)).
		WithArgs(
			sqlmock.AnyArg(),
			sqlmock.AnyArg(),
			0,
			100,
			TypeLocal,
			"",
			"abc123",
		).
		WillReturnRows(sqlmock.NewRows([]string{"id"}).AddRow("11"))
	s.mock.ExpectCommit()

	// New model
	m := Model{
		UserID: 100,
		Type:   TypeLocal,
		Secret: "abc123",
	}
	err := m.Save()
	require.NoError(s.T(), err)
	require.NoError(s.T(), s.mock.ExpectationsWereMet())
}

func (s *testsuite) TestSetPassword() {
	// goleak is used to detect goroutine leaks
	defer goleak.VerifyNone(s.T(), goleak.IgnoreAnyFunction("database/sql.(*DB).connectionOpener"))
	m := Model{UserID: 100}
	err := m.SetPassword("abc123")
	require.NoError(s.T(), err)
	assert.Equal(s.T(), TypeLocal, m.Type)
	assert.Greater(s.T(), len(m.Secret), 15)
}

func (s *testsuite) TestValidateSecret() {
	// goleak is used to detect goroutine leaks
	defer goleak.VerifyNone(s.T(), goleak.IgnoreAnyFunction("database/sql.(*DB).connectionOpener"))

	m := Model{UserID: 100}
	m.SetPassword("abc123")

	err := m.ValidateSecret("abc123")
	require.NoError(s.T(), err)
	err = m.ValidateSecret("this is not the password")
	assert.NotNil(s.T(), err)
	assert.Equal(s.T(), "Invalid Credentials", err.Error())

	m.Type = "not a valid type"
	err = m.ValidateSecret("abc123")
	assert.NotNil(s.T(), err)
	assert.Equal(s.T(), "Could not validate Secret, auth type is not Local", err.Error())
}
