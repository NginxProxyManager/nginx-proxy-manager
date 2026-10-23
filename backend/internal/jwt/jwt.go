package jwt

import (
	"context"
	"errors"
	"time"

	"npm/internal/entity/session"
	"npm/internal/logger"

	"github.com/golang-jwt/jwt/v5"
	"github.com/rotisserie/eris"
)

// UserJWTClaims is the structure of a JWT for a User
type UserJWTClaims struct {
	UserID    uint     `json:"uid"`
	SessionID string   `json:"sid"`
	Roles     []string `json:"roles"`
	jwt.RegisteredClaims
}

// GeneratedResponse is the response of a generated token, usually used in http response
type GeneratedResponse struct {
	Expires int64  `json:"expires"`
	Token   string `json:"token"`
}

// GenerateForSession issues a token only for an authorized live session.
func GenerateForSession(userID uint, sessionID string, forSSE bool) (GeneratedResponse, error) {
	var response GeneratedResponse
	principal, err := session.Authorize(context.Background(), sessionID, time.Now().UTC())
	if err != nil || principal.Session.UserID != userID {
		return response, errors.New("unauthorized session")
	}

	key, _ := GetPrivateKey()
	expires := time.Now().Add(24 * time.Hour)
	issuer := "api"

	if forSSE {
		issuer = "sse"
		expires = time.Now().Add(time.Minute)
	}
	if expires.After(principal.Session.ExpiresAt) {
		expires = principal.Session.ExpiresAt
	}
	if !expires.After(time.Now()) {
		return response, errors.New("expired session")
	}

	// Create the Claims
	claims := UserJWTClaims{
		userID,
		sessionID,
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
