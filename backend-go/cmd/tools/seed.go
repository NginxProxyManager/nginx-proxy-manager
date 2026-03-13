package main

import (
	"log"

	"golang.org/x/crypto/bcrypt"
	"npm-backend/internal/models"
)

func main() {
	if err := models.InitDB(); err != nil {
		log.Fatal(err)
	}

	user := models.User{
		Email:    "admin@example.com",
		Name:     "Admin",
		Nickname: "admin",
		Roles:    "[\"admin\"]",
	}

	if err := models.DB.FirstOrCreate(&user, models.User{Email: "admin@example.com"}).Error; err != nil {
		log.Fatal(err)
	}

	hash, _ := bcrypt.GenerateFromPassword([]byte("changeme"), bcrypt.DefaultCost)
	auth := models.Auth{
		UserID: user.ID,
		Type:   "password",
		Secret: string(hash),
	}

	if err := models.DB.FirstOrCreate(&auth, models.Auth{UserID: user.ID, Type: "password"}).Error; err != nil {
		log.Fatal(err)
	}

	log.Println("Test user seeded")
}
