package main

import (
	"log"

	"github.com/gin-gonic/gin"

	"npm-backend/internal/handlers"
	"npm-backend/internal/middleware"
	"npm-backend/internal/models"
	"npm-backend/internal/services"
)

func main() {
	log.Println("Initializing Nginx Proxy Manager Go Backend...")

	// 1. Initialize Database
	if err := models.InitDB(); err != nil {
		log.Fatalf("Failed to initialize database: %v", err)
	}
	log.Println("Database initialized successfully.")

	// 2. Initialize Services
	authService := services.NewAuthService(models.DB)

	// 3. Initialize Handlers
	tokenHandler := handlers.NewTokenHandler(authService)

	// 4. Setup Gin Router
	r := gin.Default()

	// 5. Setup Routes
	api := r.Group("/api")
	{
		// Public Routes
		api.POST("/tokens", tokenHandler.GenerateToken)

		// Protected Routes
		protected := api.Group("/")
		protected.Use(middleware.RequireAuth())
		{
			// Just a ping endpoint to test auth for now
			protected.GET("/me", func(c *gin.Context) {
				userID := c.MustGet("user_id").(uint)
				c.JSON(200, gin.H{"message": "Auth successful", "user_id": userID})
			})
		}
	}

	// 6. Start Server
	log.Println("Listening and serving on :3000")
	if err := r.Run(":3000"); err != nil {
		log.Fatalf("Failed to start server: %v", err)
	}
}
