package host

import (
	"regexp"
	"testing"
	"time"

	"npm/internal/model"
	"npm/internal/status"
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
	mock      sqlmock.Sqlmock
	singleRow *sqlmock.Rows
}

func makeJSONB(str string) types.JSONB {
	m := types.JSONB{}
	m.UnmarshalJSON([]byte(str))
	return m
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
		"nginx_template_id",
		"listen_interface",
		"domain_names",
		"upstream_id",
		"proxy_scheme",
		"proxy_host",
		"proxy_port",
		"certificate_id",
		"access_list_id",
		"ssl_forced",
		"caching_enabled",
		"block_exploits",
		"allow_websocket_upgrade",
		"http2_support",
		"hsts_enabled",
		"hsts_subdomains",
		"paths",
		"advanced_config",
		"status",
		"error_message",
		"is_disabled",
	}).AddRow(
		10,                             // ID
		100,                            // UserID
		"proxy",                        // Type
		20,                             // NginxTemplateID
		"",                             // ListenInterface
		makeJSONB("[\"example.com\"]"), // DomainNames
		0,                              // UpstreamID
		"http",                         // ProxyScheme
		"127.0.0.1",                    // ProxyHost
		3000,                           // ProxyPort
		types.NullableDBUint{Uint: 0},  // CertificateID
		types.NullableDBUint{Uint: 0},  // AccessListID
		false,                          // SSLForced
		false,                          // CachingEnabled
		false,                          // BlockExploits
		false,                          // AllowWebsocketUpgrade
		false,                          // HTTP2Support
		false,                          // HSTSEnabled
		false,                          // HSTSSubdomains
		"",                             // Paths
		"",                             // AdvancedConfig
		status.StatusReady,             // Status
		"",                             // ErrorMessage
		false,                          // IsDisabled
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

func (s *testsuite) TestGetByID() {
	// goleak is used to detect goroutine leaks
	defer goleak.VerifyNone(s.T(), goleak.IgnoreAnyFunction("database/sql.(*DB).connectionOpener"))

	s.mock.
		ExpectQuery(regexp.QuoteMeta(`SELECT * FROM "host" WHERE "host"."id" = $1 AND "host"."is_deleted" = $2 ORDER BY "host"."id" LIMIT 1`)).
		WithArgs(10, 0).
		WillReturnRows(s.singleRow)

	m, err := GetByID(10)
	require.NoError(s.T(), err)
	require.NoError(s.T(), s.mock.ExpectationsWereMet())
	assert.Equal(s.T(), uint(10), m.ID)
}

func (s *testsuite) TestSave() {
	// goleak is used to detect goroutine leaks
	defer goleak.VerifyNone(s.T(), goleak.IgnoreAnyFunction("database/sql.(*DB).connectionOpener"))

	s.mock.ExpectBegin()
	s.mock.ExpectQuery(regexp.QuoteMeta(`INSERT INTO "host" ("created_at","updated_at","is_deleted","user_id","type","nginx_template_id","listen_interface","domain_names","upstream_id","proxy_scheme","proxy_host","proxy_port","certificate_id","access_list_id","ssl_forced","caching_enabled","block_exploits","allow_websocket_upgrade","http2_support","hsts_enabled","hsts_subdomains","paths","advanced_config","status","error_message","is_disabled") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26) RETURNING "id"`)).
		WithArgs(
			sqlmock.AnyArg(),
			sqlmock.AnyArg(),
			0,
			100,
			"proxy",
			20,
			"",
			"[\"example.com\"]",
			nil,
			"http",
			"127.0.0.1",
			3000, // proxy_port
			nil,
			nil,
			false,
			false,
			false,
			false,
			false,
			false,
			false,
			"",
			"",
			status.StatusReady,
			"",
			false,
		).
		WillReturnRows(sqlmock.NewRows([]string{"id"}).AddRow("11"))
	s.mock.ExpectCommit()

	// New model, as system
	m := Model{
		UserID:          100,
		Type:            "proxy",
		NginxTemplateID: 20,
		DomainNames:     makeJSONB("[\"example.com\"]"),
		ProxyScheme:     "http",
		ProxyHost:       "127.0.0.1",
		ProxyPort:       3000,
		Status:          status.StatusReady,
	}
	err := m.Save(true)
	require.NoError(s.T(), err)
	require.NoError(s.T(), s.mock.ExpectationsWereMet())
}

func (s *testsuite) TestDelete() {
	// goleak is used to detect goroutine leaks
	defer goleak.VerifyNone(s.T(), goleak.IgnoreAnyFunction("database/sql.(*DB).connectionOpener"))

	s.mock.ExpectBegin()
	s.mock.
		ExpectExec(regexp.QuoteMeta(`UPDATE "host" SET "is_deleted"=$1 WHERE "host"."id" = $2 AND "host"."is_deleted" = $3`)).
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

func (s *testsuite) TestGetTemplate() {
	// goleak is used to detect goroutine leaks
	defer goleak.VerifyNone(s.T(), goleak.IgnoreAnyFunction("database/sql.(*DB).connectionOpener"))

	m := Model{
		ModelBase: model.ModelBase{
			ID:        10,
			CreatedAt: time.Date(2018, 1, 1, 0, 0, 0, 0, time.UTC).UnixMilli(),
			UpdatedAt: time.Date(2018, 8, 12, 7, 30, 24, 16, time.UTC).UnixMilli(),
		},
		UserID:          100,
		Type:            "proxy",
		NginxTemplateID: 20,
		DomainNames:     makeJSONB("[\"example.com\"]"),
		ProxyScheme:     "http",
		ProxyHost:       "127.0.0.1",
		ProxyPort:       3000,
		Status:          status.StatusReady,
	}

	t := m.GetTemplate()
	assert.Equal(s.T(), uint(10), t.ID)
	assert.Equal(s.T(), "Mon, 01 Jan 2018 10:00:00 AEST", t.CreatedAt)
	assert.Equal(s.T(), "Sun, 12 Aug 2018 17:30:24 AEST", t.UpdatedAt)
	assert.Equal(s.T(), uint(100), t.UserID)
	assert.Equal(s.T(), "proxy", t.Type)
	assert.Equal(s.T(), uint(20), t.NginxTemplateID)
	assert.Equal(s.T(), "http", t.ProxyScheme)
	assert.Equal(s.T(), "127.0.0.1", t.ProxyHost)
	assert.Equal(s.T(), 3000, t.ProxyPort)
	assert.Equal(s.T(), []string{"example.com"}, t.DomainNames)
	assert.Equal(s.T(), status.StatusReady, t.Status)
}
