package dnsprovider

import (
	"encoding/json"
	"regexp"
	"testing"

	"npm/internal/model"
	"npm/internal/test"
	"npm/internal/types"

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
	mock          sqlmock.Sqlmock
	singleRow     *sqlmock.Rows
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
	s.singleRow = sqlmock.NewRows([]string{
		"id",
		"user_id",
		"name",
		"acmesh_name",
		"dns_sleep",
		"meta",
	}).AddRow(
		10,
		100,
		"Route53",
		"dns_aws",
		10,
		getMeta().Encoded,
	)

	s.listCountRows = sqlmock.NewRows([]string{
		"count(*)",
	}).AddRow(
		2,
	)

	s.listRows = sqlmock.NewRows([]string{
		"id",
		"user_id",
		"name",
		"acmesh_name",
		"dns_sleep",
		"meta",
	}).AddRow(
		10,
		100,
		"Route53",
		"dns_aws",
		10,
		getMeta().Encoded,
	).AddRow(
		11,
		100,
		"ClouDNS",
		"dns_cloudns",
		8,
		types.JSONB{},
	)
}

// In order for 'go test' to run this suite, we need to create
// a normal test function and pass our suite to suite.Run
func TestExampleTestSuite(t *testing.T) {
	suite.Run(t, new(testsuite))
}

func getMeta() types.JSONB {
	m := types.JSONB{}
	m.UnmarshalJSON([]byte(`{"access_key_id": "BKINOTLNEREALYBL52W2I", "access_key": "NOTAREALKEY+9qSca7R9U6vUuetR8sh"}`))
	return m
}

func assertModel(t *testing.T, m Model) {
	assert.Equal(t, uint(10), m.ID, "ID not expected value")
	assert.Equal(t, uint(100), m.UserID, "UserID not expected value")
	assert.Equal(t, "Route53", m.Name, "Name not expected value")
	assert.Equal(t, "dns_aws", m.AcmeshName, "AcmeshName not expected value")
	assert.Equal(t, 10, m.DNSSleep, "DNSSleep not expected value")
	assert.Equal(t, getMeta(), m.Meta, "Meta not expected value")
}

// +------------+
// | Tests      |
// +------------+

func (s *testsuite) TestGetByID() {
	// goleak is used to detect goroutine leaks
	defer goleak.VerifyNone(s.T(), goleak.IgnoreAnyFunction("database/sql.(*DB).connectionOpener"))

	s.mock.
		ExpectQuery(regexp.QuoteMeta(`SELECT * FROM "dns_provider" WHERE "dns_provider"."id" = $1 AND "dns_provider"."is_deleted" = $2 ORDER BY "dns_provider"."id" LIMIT 1`)).
		WithArgs(10, 0).
		WillReturnRows(s.singleRow)

	m, err := GetByID(10)
	require.NoError(s.T(), err)
	require.NoError(s.T(), s.mock.ExpectationsWereMet())
	assertModel(s.T(), m)
}

func (s *testsuite) TestGetAcmeShEnvVars() {
	// goleak is used to detect goroutine leaks
	defer goleak.VerifyNone(s.T(), goleak.IgnoreAnyFunction("database/sql.(*DB).connectionOpener"))

	type want struct {
		envs []string
		err  error
	}

	tests := []struct {
		name        string
		dnsProvider Model
		metaJSON    string
		want        want
	}{
		{
			name: "dns_aws",
			dnsProvider: Model{
				AcmeshName: "dns_aws",
			},
			metaJSON: `{"AWS_ACCESS_KEY_ID":"sdfsdfsdfljlbjkljlkjsdfoiwje","AWS_SECRET_ACCESS_KEY":"xxxxxxx"}`,
			want: want{
				envs: []string{
					`AWS_ACCESS_KEY_ID=sdfsdfsdfljlbjkljlkjsdfoiwje`,
					`AWS_SECRET_ACCESS_KEY=xxxxxxx`,
				},
				err: nil,
			},
		},
		{
			name: "dns_cf",
			dnsProvider: Model{
				AcmeshName: "dns_cf",
			},
			metaJSON: `{"CF_Key":"sdfsdfsdfljlbjkljlkjsdfoiwje","CF_Email":"me@example.com","CF_Token":"dkfjghdk","CF_Account_ID":"hgbdjfg","CF_Zone_ID":"ASDASD"}`,
			want: want{
				envs: []string{
					`CF_Token=dkfjghdk`,
					`CF_Account_ID=hgbdjfg`,
					`CF_Zone_ID=ASDASD`,
					`CF_Key=sdfsdfsdfljlbjkljlkjsdfoiwje`,
					`CF_Email=me@example.com`,
				},
				err: nil,
			},
		},
		{
			name: "dns_duckdns",
			dnsProvider: Model{
				AcmeshName: "dns_duckdns",
			},
			metaJSON: `{"DuckDNS_Token":"aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"}`,
			want: want{
				envs: []string{
					`DuckDNS_Token=aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee`,
				},
				err: nil,
			},
		},
	}

	for _, tt := range tests {
		s.T().Run(tt.name, func(t *testing.T) {
			var meta types.JSONB
			err := json.Unmarshal([]byte(tt.metaJSON), &meta.Decoded)
			assert.Equal(t, nil, err)
			tt.dnsProvider.Meta = meta
			envs, err := tt.dnsProvider.GetAcmeShEnvVars()
			assert.Equal(t, tt.want.err, err)
			for _, i := range tt.want.envs {
				assert.Contains(t, envs, i)
			}
		})
	}
}

func (s *testsuite) TestList() {
	// goleak is used to detect goroutine leaks
	defer goleak.VerifyNone(s.T(), goleak.IgnoreAnyFunction("database/sql.(*DB).connectionOpener"))

	s.mock.
		ExpectQuery(regexp.QuoteMeta(`SELECT count(*) FROM "dns_provider" WHERE acmesh_name LIKE $1 AND "dns_provider"."is_deleted" = $2`)).
		WithArgs("dns%", 0).
		WillReturnRows(s.listCountRows)

	s.mock.
		ExpectQuery(regexp.QuoteMeta(`SELECT * FROM "dns_provider" WHERE acmesh_name LIKE $1 AND "dns_provider"."is_deleted" = $2 ORDER BY name asc LIMIT 8`)).
		WithArgs("dns%", 0).
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
			Field:    "acmesh_name",
			Modifier: "starts",
			Value:    []string{"dns"},
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
	// goleak is used to detect goroutine leaks
	defer goleak.VerifyNone(s.T(), goleak.IgnoreAnyFunction("database/sql.(*DB).connectionOpener"))

	s.mock.ExpectBegin()
	s.mock.ExpectQuery(regexp.QuoteMeta(`INSERT INTO "dns_provider" ("created_at","updated_at","is_deleted","user_id","name","acmesh_name","dns_sleep","meta") VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING "id"`)).
		WithArgs(
			sqlmock.AnyArg(),
			sqlmock.AnyArg(),
			0,
			100,
			"Route53",
			"dns_route53",
			10,
			sqlmock.AnyArg(),
		).
		WillReturnRows(sqlmock.NewRows([]string{"id"}).AddRow("11"))
	s.mock.ExpectCommit()

	// New model, no user
	m := Model{
		Name:       "Route53",
		AcmeshName: "dns_route53",
		DNSSleep:   10,
		Meta:       getMeta(),
	}
	err := m.Save()
	assert.Equal(s.T(), "User ID must be specified", err.Error())

	// Success
	m.UserID = 100
	err = m.Save()
	require.NoError(s.T(), err)
	require.NoError(s.T(), s.mock.ExpectationsWereMet())
}

func (s *testsuite) TestDelete() {
	// goleak is used to detect goroutine leaks
	defer goleak.VerifyNone(s.T(), goleak.IgnoreAnyFunction("database/sql.(*DB).connectionOpener"))

	s.mock.ExpectBegin()
	s.mock.
		ExpectExec(regexp.QuoteMeta(`UPDATE "dns_provider" SET "is_deleted"=$1 WHERE "dns_provider"."id" = $2 AND "dns_provider"."is_deleted" = $3`)).
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
