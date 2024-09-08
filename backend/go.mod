module npm

go 1.20

require (
	github.com/DATA-DOG/go-sqlmock v1.5.2
	github.com/alexflint/go-arg v1.5.1
	github.com/amacneil/dbmate/v2 v2.3.0
	github.com/aymerick/raymond v2.0.3-0.20180322193309-b565731e1464+incompatible
	github.com/dgrijalva/jwt-go v3.2.0+incompatible
	github.com/drexedam/gravatar v0.0.0-20210327211422-e94eea8c338e
	github.com/fatih/color v1.17.0
	github.com/glebarez/sqlite v1.11.0
	github.com/go-chi/chi/v5 v5.1.0
	github.com/go-chi/cors v1.2.1
	github.com/go-chi/jwtauth/v5 v5.3.1
	github.com/jc21/go-sse v0.0.0-20230307071053-2e6b1dbcb7ec
	github.com/jc21/jsref v0.0.0-20210608024405-a97debfc4760
	github.com/patrickmn/go-cache v2.1.0+incompatible
	github.com/qri-io/jsonschema v0.2.1
	github.com/rotisserie/eris v0.5.4
	github.com/stretchr/testify v1.9.0
	github.com/vrischmann/envconfig v1.3.0
	go.uber.org/goleak v1.3.0
	golang.org/x/crypto v0.27.0
	gorm.io/datatypes v1.2.1
	gorm.io/driver/mysql v1.5.7
	gorm.io/driver/postgres v1.5.9
	gorm.io/gorm v1.25.11
	gorm.io/plugin/soft_delete v1.2.1
)

require (
	filippo.io/edwards25519 v1.1.0 // indirect
	github.com/alexflint/go-scalar v1.2.0 // indirect
	github.com/davecgh/go-spew v1.1.1 // indirect
	github.com/decred/dcrd/dcrec/secp256k1/v4 v4.3.0 // indirect
	github.com/dustin/go-humanize v1.0.1 // indirect
	github.com/glebarez/go-sqlite v1.22.0 // indirect
	github.com/go-sql-driver/mysql v1.8.1 // indirect
	github.com/goccy/go-json v0.10.2 // indirect
	github.com/google/uuid v1.6.0 // indirect
	github.com/jackc/pgpassfile v1.0.0 // indirect
	github.com/jackc/pgservicefile v0.0.0-20231201235250-de7065d80cb9 // indirect
	github.com/jackc/pgx/v5 v5.5.5 // indirect
	github.com/jackc/puddle/v2 v2.2.1 // indirect
	github.com/jinzhu/inflection v1.0.0 // indirect
	github.com/jinzhu/now v1.1.5 // indirect
	github.com/kballard/go-shellquote v0.0.0-20180428030007-95032a82bc51 // indirect
	github.com/lestrrat-go/blackmagic v1.0.2 // indirect
	github.com/lestrrat-go/httpcc v1.0.1 // indirect
	github.com/lestrrat-go/httprc v1.0.5 // indirect
	github.com/lestrrat-go/iter v1.0.2 // indirect
	github.com/lestrrat-go/jspointer v0.0.0-20181205001929-82fadba7561c // indirect
	github.com/lestrrat-go/jwx/v2 v2.0.21 // indirect
	github.com/lestrrat-go/option v1.0.1 // indirect
	github.com/lestrrat-go/pdebug/v3 v3.0.1 // indirect
	github.com/lestrrat-go/structinfo v0.0.0-20210312050401-7f8bd69d6acb // indirect
	github.com/lib/pq v1.10.9 // indirect
	github.com/mattn/go-colorable v0.1.13 // indirect
	github.com/mattn/go-isatty v0.0.20 // indirect
	github.com/ncruces/go-strftime v0.1.9 // indirect
	github.com/pkg/errors v0.9.1 // indirect
	github.com/pmezard/go-difflib v1.0.0 // indirect
	github.com/qri-io/jsonpointer v0.1.1 // indirect
	github.com/remyoudompheng/bigfft v0.0.0-20230129092748-24d4a6f8daec // indirect
	github.com/rogpeppe/go-internal v1.10.0 // indirect
	github.com/segmentio/asm v1.2.0 // indirect
	golang.org/x/mod v0.17.0 // indirect
	golang.org/x/sync v0.8.0 // indirect
	golang.org/x/sys v0.25.0 // indirect
	golang.org/x/text v0.18.0 // indirect
	golang.org/x/tools v0.21.1-0.20240508182429-e35e4ccd0d2d // indirect
	gopkg.in/yaml.v3 v3.0.1 // indirect
	lukechampine.com/uint128 v1.3.0 // indirect
	modernc.org/cc/v3 v3.41.0 // indirect
	modernc.org/ccgo/v3 v3.17.0 // indirect
	modernc.org/libc v1.50.5 // indirect
	modernc.org/mathutil v1.6.0 // indirect
	modernc.org/memory v1.8.0 // indirect
	modernc.org/opt v0.1.3 // indirect
	modernc.org/sqlite v1.28.0 // indirect
	modernc.org/strutil v1.2.0 // indirect
	modernc.org/token v1.1.0 // indirect
)

replace github.com/amacneil/dbmate/v2 => github.com/jc21/dbmate/v2 v2.0.0-20230527023241-0aaa124cc0f1

replace modernc.org/sqlite => gitlab.com/jc21com/sqlite v1.22.2-0.20230527022643-b56cedb3bc85
