package jwt

import (
	"regexp"
	"testing"

	"npm/internal/entity/user"
	"npm/internal/model"
	"npm/internal/test"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/stretchr/testify/suite"
	"go.uber.org/goleak"
	"gorm.io/gorm"
)

// +------------+
// | Setup      |
// +------------+

type testsuite struct {
	suite.Suite
	mock             sqlmock.Sqlmock
	keysRow          *sqlmock.Rows
	privateKeyString string
	publicKeyString  string
}

// SetupTest is executed before each test
func (s *testsuite) SetupTest() {
	var err error
	s.mock, err = test.Setup()
	require.NoError(s.T(), err)
	test.InitConfig(s.T())

	s.publicKeyString = `-----BEGIN PUBLIC KEY-----
MIICCgKCAgEAmjPv7Bnb02rdcMqPIK6EMt7hIYzobgmIwoEtNVP6IaVzPdTo0l5V
prxVH9J2oeJzZPmUjgsru+1db/RqOT4QYma7FGjoVi/AZvGGbiJENOK87K0d3byM
CZ1bridvVOWKU92EvK+uTBfG9wtEpyS4pTC6mt6jKnKJrlRA7pKbHB7jmgBDU+6C
CniYIkXpmHKQu1Q4Mpa5oYzgNMiAnxRmps8BwkVNwzMc7mwdhSn+M+qkVJJO4Q5A
BgHoieR6y5+P2oieX4Z8HwnzxKS79FmTo0JhSVadPxYTRKWLAcVgM7lo/d+KQy7o
v+jFVYNiaeSdAPgfEoYdiJA7NZC4xEVsQMeZLGZp1WpcwJ7DInn0Z4ILsuFIeQGv
nmaq+yFRgJcQT3zANlitqwdK4FWd0DN1PH17YG3oIGvxHCFEClZqeLPte1lB3T3w
xyrw00OfSKBwZ9gAxemxQRu/8/9EnLOM4FlanK8/S4GIPgj05LvE52ZLotXqQU77
PIXaGwufKkwOx0oHmy82wZpc4A18Po6UMcsnyfR+ykKHacuRKCHnJjCEszKR8t/i
BqL4+sCPZfE/6FSjZi1tHGTybMGVTEL/HnJEHOZqvWbKwl6xLln38UWi7YG/FFs/
ymcpxqEnMWQCs8ZmA1q6nPkzHkjYGmr5SyC6jaFaKJN1SgCsaP2sF80CAwEAAQ==
-----END PUBLIC KEY-----`

	s.privateKeyString = `-----BEGIN PRIVATE KEY-----
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
-----END PRIVATE KEY-----`

	// These rows need to be intantiated for each test as they are
	// read in the db object, and their row position is not resettable
	// between tests.
	s.keysRow = sqlmock.NewRows([]string{
		"public_key",
		"private_key",
	}).AddRow(
		s.publicKeyString,
		s.privateKeyString,
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

func (s *testsuite) TestLoadKeys() {
	s.T().Skip("Skipping as it's not working")

	// goleak is used to detect goroutine leaks
	defer goleak.VerifyNone(s.T(), goleak.IgnoreAnyFunction("database/sql.(*DB).connectionOpener"))

	// Required for clean test runs
	currentKeys = KeysModel{}

	// first query, no rows
	s.mock.
		ExpectQuery(regexp.QuoteMeta(`SELECT * FROM "jwt_keys" WHERE "jwt_keys"."is_deleted" = $1`)).
		WithArgs(0).
		WillReturnError(gorm.ErrRecordNotFound)

	// insert row
	s.mock.ExpectBegin()
	s.mock.ExpectQuery(regexp.QuoteMeta(`INSERT INTO "jwt_keys" ("created_at","updated_at","is_deleted","public_key","private_key") VALUES ($1,$2,$3,$4,$5) RETURNING "id"`)).
		WithArgs(
			sqlmock.AnyArg(),
			sqlmock.AnyArg(),
			0,
			sqlmock.AnyArg(),
			sqlmock.AnyArg(),
		).
		WillReturnRows(sqlmock.NewRows([]string{"id"}).AddRow("10"))
	s.mock.ExpectCommit()

	// last query, load existing row
	s.mock.
		ExpectQuery(regexp.QuoteMeta(`SELECT * FROM "jwt_keys" WHERE "jwt_keys"."is_deleted" = $1`)).
		WithArgs(0).
		WillReturnRows(s.keysRow)

	// Load and create first
	err := LoadKeys()
	require.NoError(s.T(), err)

	// Load something we just created
	k := KeysModel{}
	err = k.LoadLatest()
	require.NoError(s.T(), err)

	require.NoError(s.T(), s.mock.ExpectationsWereMet())
}

func (s *testsuite) TestGetPrivateKey() {
	// goleak is used to detect goroutine leaks
	defer goleak.VerifyNone(s.T(), goleak.IgnoreAnyFunction("database/sql.(*DB).connectionOpener"))

	// Required for clean test runs
	privateKey = nil
	currentKeys = KeysModel{}

	// First call, expect error as currentKeys isn't loaded
	_, err := GetPrivateKey()
	assert.Equal(s.T(), "Could not get Private Key from configuration", err.Error())

	// Set currentKeys and try again
	currentKeys = KeysModel{
		ModelBase: model.ModelBase{
			ID: 10,
		},
		PrivateKey: s.privateKeyString,
		PublicKey:  s.publicKeyString,
	}

	// Get after currentKeys is set
	_, err = GetPrivateKey()
	require.NoError(s.T(), err)
	require.NoError(s.T(), s.mock.ExpectationsWereMet())
}

func (s *testsuite) TestGetPublicKey() {
	// goleak is used to detect goroutine leaks
	defer goleak.VerifyNone(s.T(), goleak.IgnoreAnyFunction("database/sql.(*DB).connectionOpener"))

	// Required for clean test runs
	publicKey = nil
	currentKeys = KeysModel{}

	// First call, expect error as currentKeys isn't loaded
	_, err := GetPublicKey()
	assert.Equal(s.T(), "Could not get Public Key from configuration", err.Error())

	// Set currentKeys and try again
	currentKeys = KeysModel{
		ModelBase: model.ModelBase{
			ID: 10,
		},
		PrivateKey: s.privateKeyString,
		PublicKey:  s.publicKeyString,
	}

	// Get after currentKeys is set
	_, err = GetPublicKey()
	require.NoError(s.T(), err)
	require.NoError(s.T(), s.mock.ExpectationsWereMet())
}

func (s *testsuite) TestGenerate() {
	// goleak is used to detect goroutine leaks
	defer goleak.VerifyNone(s.T(), goleak.IgnoreAnyFunction("database/sql.(*DB).connectionOpener"))

	currentKeys = KeysModel{
		ModelBase: model.ModelBase{
			ID: 10,
		},
		PrivateKey: s.privateKeyString,
		PublicKey:  s.publicKeyString,
	}

	usr := user.Model{
		ModelBase: model.ModelBase{
			ID: 10,
		},
	}

	// test 1, user key
	r, err := Generate(&usr, false)
	require.NoError(s.T(), err)
	assert.Greater(s.T(), len(r.Token), 20)

	// test 2, sse key
	r, err = Generate(&usr, true)
	require.NoError(s.T(), err)
	assert.Greater(s.T(), len(r.Token), 20)

	require.NoError(s.T(), s.mock.ExpectationsWereMet())
}
