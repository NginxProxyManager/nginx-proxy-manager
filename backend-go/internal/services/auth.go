package services

import (
	"errors"
	"os"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"

	"npm-backend/internal/models"
)

// AuthService handles authentication logic like password validation
// and JWT token generation
type AuthService struct {
	DB *gorm.DB
}

type TokenResponse struct {
	Token   string `json:"token"`
	Expires string `json:"expires"`
}

func NewAuthService(db *gorm.DB) *AuthService {
	return &AuthService{DB: db}
}

// AuthenticateUser verifies the given email and password, returning JWT if successful
func (s *AuthService) AuthenticateUser(email, password string) (*TokenResponse, error) {
	var user models.User
	if err := s.DB.Where("email = ? AND is_deleted = ? AND is_disabled = ?", email, 0, 0).First(&user).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, errors.New("invalid credentials")
		}
		return nil, err
	}

	var auth models.Auth
	if err := s.DB.Where("user_id = ? AND type = 'password' AND is_deleted = ?", user.ID, 0).First(&auth).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, errors.New("invalid credentials")
		}
		return nil, err
	}

	// NodeJS app leverages bcrypt for hash comparison
	if err := bcrypt.CompareHashAndPassword([]byte(auth.Secret), []byte(password)); err != nil {
		return nil, errors.New("invalid credentials")
	}

	// Generate JWT claims
	expirationTime := time.Now().Add(24 * time.Hour)
	roles := []string{} // Should ideally parse user.Roles JSON, simplifying for now

	claims := &jwt.MapClaims{
		"user_id": user.ID,
		"roles":   roles,
		"exp":     expirationTime.Unix(),
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	secret := os.Getenv("JWT_SECRET")
	if secret == "" {
		secret = "changeme"
	}

	tokenString, err := token.SignedString([]byte(secret))
	if err != nil {
		return nil, err
	}

	return &TokenResponse{
		Token:   tokenString,
		Expires: expirationTime.Format(time.RFC3339),
	}, nil
}
