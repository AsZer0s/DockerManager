package model

import (
	"time"

	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

type User struct {
	ID           uint         `gorm:"primaryKey" json:"id"`
	CreatedAt	 time.Time    `json:"created_at"`
	UpdatedAt    time.Time    `json:"updated_at"`
	LastLogin    *time.Time   `json:"last_login"`
	Username     string       `gorm:"uniqueIndex;not null" json:"username"`
	Password     string       `gorm:"not null" json:"-"`
	TokenVersion int64        `gorm:"default:1" json:"-"`
	TelegramID   int64        `gorm:"index" json:"telegram_id"`
	Role         string       `gorm:"default:'user'" json:"role"`
	
	ServerPermissions []ServerPermission `gorm:"foreignKey:UserID"`
}

func HashPassword(password string) (string, error) {
	bytes, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	return string(bytes), err
}

func (u *User) BeforeCreate(tx *gorm.DB) (err error) {
	if u.Password != "" {
		u.Password, err = HashPassword(u.Password)
	}
	return
}
