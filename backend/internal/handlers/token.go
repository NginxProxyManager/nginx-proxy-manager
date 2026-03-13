package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"

	"npm-backend/internal/services"
)

type TokenRequest struct {
	Identity string `json:"identity" binding:"required,email"`
	Secret   string `json:"secret" binding:"required"`
}

type TokenHandler struct {
	AuthService *services.AuthService
}

func NewTokenHandler(authService *services.AuthService) *TokenHandler {
	return &TokenHandler{AuthService: authService}
}

// GenerateToken handles POST /api/tokens
func (h *TokenHandler) GenerateToken(c *gin.Context) {
	var req TokenRequest
	
	// Validate JSON input
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid payload", "details": err.Error()})
		return
	}

	// Attempt authentication
	response, err := h.AuthService.AuthenticateUser(req.Identity, req.Secret)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid credentials"})
		return
	}

	c.JSON(http.StatusOK, response)
}
