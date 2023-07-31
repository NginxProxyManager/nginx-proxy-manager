package certificateauthority

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
	mock          sqlmock.Sqlmock
	testCA        *sqlmock.Rows
	listCountRows *sqlmock.Rows
	listRows      *sqlmock.Rows
}

// SetupTest is executed before each test
func (s *testsuite) SetupTest() {
	var err error
	s.mock, err = test.Setup()
	require.NoError(s.T(), err)

	// These rows need to be intantiated for each test as they are
	// read in the db object, and their row position is not resettable
	// between tests.
	s.testCA = sqlmock.NewRows([]string{
		"id",
		"name",
		"acmesh_server",
		"ca_bundle",
		"is_wildcard_supported",
		"max_domains",
	}).AddRow(
		10,
		"Test CA",
		"https://ca.internal/acme/acme/directory",
		"/etc/ssl/certs/NginxProxyManager.crt",
		true,
		2,
	)

	s.listCountRows = sqlmock.NewRows([]string{
		"count(*)",
	}).AddRow(
		2,
	)

	s.listRows = sqlmock.NewRows([]string{
		"id",
		"name",
		"acmesh_server",
		"ca_bundle",
		"is_wildcard_supported",
		"max_domains",
	}).AddRow(
		10,
		"Test CA",
		"https://ca.internal/acme/acme/directory",
		"/etc/ssl/certs/NginxProxyManager.crt",
		true,
		2,
	).AddRow(
		11,
		"Test CA 2",
		"https://ca2.internal/acme/acme/directory",
		"/etc/ssl/certs/NginxProxyManager.crt",
		true,
		5,
	)
}

// In order for 'go test' to run this suite, we need to create
// a normal test function and pass our suite to suite.Run
func TestExampleTestSuite(t *testing.T) {
	suite.Run(t, new(testsuite))
}

func assertModel(t *testing.T, m Model) {
	assert.Equal(t, uint(10), m.ID)
	assert.Equal(t, "Test CA", m.Name)
	assert.Equal(t, "https://ca.internal/acme/acme/directory", m.AcmeshServer)
	assert.Equal(t, "/etc/ssl/certs/NginxProxyManager.crt", m.CABundle)
	assert.Equal(t, 2, m.MaxDomains)
	assert.Equal(t, true, m.IsWildcardSupported)
	assert.Equal(t, false, m.IsReadonly)
}

// +------------+
// | Tests      |
// +------------+

func (s *testsuite) TestGetByID() {
	s.mock.
		ExpectQuery(regexp.QuoteMeta(`SELECT * FROM "certificate_authority" WHERE "certificate_authority"."id" = $1 AND "certificate_authority"."is_deleted" = $2 ORDER BY "certificate_authority"."id" LIMIT 1`)).
		WithArgs(10, 0).
		WillReturnRows(s.testCA)

	m, err := GetByID(10)
	require.NoError(s.T(), err)
	require.NoError(s.T(), s.mock.ExpectationsWereMet())
	assertModel(s.T(), m)
}

func (s *testsuite) TestList() {
	s.mock.
		ExpectQuery(regexp.QuoteMeta(`SELECT count(*) FROM "certificate_authority" WHERE name LIKE $1 AND "certificate_authority"."is_deleted" = $2`)).
		WithArgs("%test%", 0).
		WillReturnRows(s.listCountRows)

	s.mock.
		ExpectQuery(regexp.QuoteMeta(`SELECT * FROM "certificate_authority" WHERE name LIKE $1 AND "certificate_authority"."is_deleted" = $2 ORDER BY name asc LIMIT 8`)).
		WithArgs("%test%", 0).
		WillReturnRows(s.listRows)

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
			Value:    []string{"test"},
		},
	}

	resp, err := List(p, f)
	require.NoError(s.T(), err)
	assert.Equal(s.T(), int64(2), resp.Total)
	assert.Equal(s.T(), p.Offset, resp.Offset)
	assert.Equal(s.T(), p.Limit, resp.Limit)
	assert.Equal(s.T(), p.Limit, resp.Limit)
	assert.Equal(s.T(), p.Sort, resp.Sort)
	assert.Equal(s.T(), f, resp.Filter)

	require.NoError(s.T(), s.mock.ExpectationsWereMet())
}

func (s *testsuite) TestSave() {
	s.mock.ExpectBegin()
	s.mock.ExpectQuery(regexp.QuoteMeta(`INSERT INTO "certificate_authority" ("created_at","updated_at","is_deleted","name","acmesh_server","ca_bundle","max_domains","is_wildcard_supported","is_readonly") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING "id"`)).
		WithArgs(
			sqlmock.AnyArg(),
			sqlmock.AnyArg(),
			0,
			"Test CA",
			"https://ca.internal/acme/acme/directory",
			"/etc/ssl/certs/NginxProxyManager.crt",
			2,
			true,
			false,
		).
		WillReturnRows(sqlmock.NewRows([]string{"id"}).AddRow("11"))
	s.mock.ExpectCommit()

	m := Model{
		Name:                "Test CA",
		AcmeshServer:        "https://ca.internal/acme/acme/directory",
		CABundle:            "/etc/ssl/certs/NginxProxyManager.crt",
		MaxDomains:          2,
		IsWildcardSupported: true,
	}
	err := m.Save()
	require.NoError(s.T(), err)
	require.NoError(s.T(), s.mock.ExpectationsWereMet())
}

func (s *testsuite) TestDelete() {
	s.mock.ExpectBegin()
	s.mock.
		ExpectExec(regexp.QuoteMeta(`UPDATE "certificate_authority" SET "is_deleted"=$1 WHERE "certificate_authority"."id" = $2 AND "certificate_authority"."is_deleted" = $3`)).
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
	}
	err2 := m2.Delete()
	require.NoError(s.T(), err2)
	require.NoError(s.T(), s.mock.ExpectationsWereMet())
}

func (s *testsuite) TestCheck() {
	m := Model{}
	err := m.Check()
	assert.Nil(s.T(), err)

	m.CABundle = "/tmp/doesnotexist"
	err = m.Check()
	assert.Equal(s.T(), errors.ErrCABundleDoesNotExist.Error(), err.Error())
}
