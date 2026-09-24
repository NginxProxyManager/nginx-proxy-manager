package jwt

import (
	"time"

	"npm/internal/entity/user"
	"npm/internal/logger"

	"github.com/golang-jwt/jwt/v5"
	"github.com/rotisserie/eris"
)

// UserJWTClaims is the structure of a JWT for a User
type UserJWTClaims struct {
	UserID uint     `json:"uid"`
	Roles  []string `json:"roles"`
	jwt.RegisteredClaims
}

// GeneratedResponse is the response of a generated token, usually used in http response
type GeneratedResponse struct {
	Expires int64  `json:"expires"`
	Token   string `json:"token"`
}

// Generate will create a JWT
func Generate(userObj *user.Model, forSSE bool) (GeneratedResponse, error) {
	var response GeneratedResponse

	key, _ := GetPrivateKey()
	expires := time.Now().AddDate(0, 0, 1) // 1 day
	issuer := "api"

	if forSSE {
		issuer = "sse"
	}

	// Create the Claims
	claims := UserJWTClaims{
		userObj.ID,
		[]string{"user"},
		jwt.RegisteredClaims{
			IssuedAt:  jwt.NewNumericDate(time.Now()),
			ExpiresAt: jwt.NewNumericDate(expires),
			Issuer:    issuer,
		},
	}

	// Create a new token object, specifying signing method and the claims
	// you would like it to contain.
	token := jwt.NewWithClaims(jwt.SigningMethodRS256, claims)
	signed, err := token.SignedString(key)
	if err != nil {
		logger.Error("JWTError", eris.Wrapf(err, "Error signing token: %v", err))
		return response, err
	}

	response = GeneratedResponse{
		Expires: expires.Unix(),
		Token:   signed,
	}

	return response, nil
}
