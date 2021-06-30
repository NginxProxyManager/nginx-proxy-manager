package model

import (
	"time"
)

// PageInfo is the model used by Api Handlers and passed on to other parts
// of the application
type PageInfo struct {
	FromDate time.Time `json:"from_date"`
	ToDate   time.Time `json:"to_date"`
	Sort     []Sort    `json:"sort"`
	Offset   int       `json:"offset"`
	Limit    int       `json:"limit"`
	Expand   []string  `json:"expand"`
}

// Sort holds the sorting data
type Sort struct {
	Field     string `json:"field"`
	Direction string `json:"direction"`
}
