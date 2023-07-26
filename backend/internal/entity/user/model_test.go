package user

import (
	"regexp"
	"testing"

	"npm/internal/errors"
	"npm/internal/model"
	"npm/internal/test"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/stretchr/testify/suite"
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

	s.singleRow = sqlmock.NewRows([]string{
		"id",
		"name",
		"nickname",
		"email",
		"is_disabled",
		"is_system",
	}).AddRow(
		10,
		"John Doe",
		"Jonny",
		"jon@example.com",
		false,
		false,
	)
}

// In order for 'go test' to run this suite, we need to create
// a normal test function and pass our suite to suite.Run
func TestExampleTestSuite(t *testing.T) {
	suite.Run(t, new(testsuite))
}

// +------------+
// | Tests      |
// +------------+

func (s *testsuite) TestLoadByID() {
	s.mock.
		ExpectQuery(regexp.QuoteMeta(`SELECT * FROM "user" WHERE "user"."id" = $1 AND "user"."is_deleted" = $2 ORDER BY "user"."id" LIMIT 1`)).
		WithArgs(10, 0).
		WillReturnRows(s.singleRow)

	m := Model{}
	err := m.LoadByID(10)
	require.NoError(s.T(), err)
	require.NoError(s.T(), s.mock.ExpectationsWereMet())
}

func (s *testsuite) TestLoadByEmail() {
	s.mock.
		ExpectQuery(regexp.QuoteMeta(`SELECT * FROM "user" WHERE email = $1 AND is_system = $2 AND "user"."is_deleted" = $3 ORDER BY "user"."id" LIMIT 1`)).
		WithArgs("jon@example.com", false, 0).
		WillReturnRows(s.singleRow)

	m := Model{}
	err := m.LoadByEmail("jon@example.com")
	require.NoError(s.T(), err)
	require.NoError(s.T(), s.mock.ExpectationsWereMet())
}

func (s *testsuite) TestSave() {
	s.mock.
		ExpectQuery(regexp.QuoteMeta(`SELECT * FROM "user" WHERE email = $1 AND is_system = $2 AND "user"."is_deleted" = $3 ORDER BY "user"."id" LIMIT 1`)).
		WithArgs("jon@example.com", false, 0).
		WillReturnRows(s.singleRow)

	s.mock.ExpectBegin()
	s.mock.ExpectQuery(regexp.QuoteMeta(`INSERT INTO "user" ("created_at","updated_at","is_deleted","name","nickname","email","is_disabled","is_system") VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING "id"`)).
		WithArgs(
			sqlmock.AnyArg(),
			sqlmock.AnyArg(),
			0,
			"John Doe",
			"Jonny",
			"sarah@example.com",
			false,
			false,
		).
		WillReturnRows(sqlmock.NewRows([]string{"id"}).AddRow("11"))
	s.mock.ExpectCommit()

	// New model, as system
	m := Model{
		Name:     "John Doe",
		Nickname: "Jonny",
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
		ModelBase: model.ModelBase{
			ID: 10,
		},
		Name: "John Doe",
	}
	err2 := m2.Delete()
	require.NoError(s.T(), err2)
	require.NoError(s.T(), s.mock.ExpectationsWereMet())
}

func (s *testsuite) TestGenerateGravatar() {
	m := Model{Email: "jon@example.com"}
	m.generateGravatar()
	assert.Equal(s.T(), "https://www.gravatar.com/avatar/dc36565cc2376197358fa27ed4c47253?d=mm&r=pg&s=128", m.GravatarURL)
}
