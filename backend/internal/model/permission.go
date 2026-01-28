package model

import (
	"time"

	"gorm.io/gorm"
)

const (
	AccessLevelRead   = "read"
	AccessLevelManage = "manage"
	AccessLevelFull   = "full"
)

type ServerPermission struct {
	ID        uint `gorm:"primarykey" json:"id"`
	CreatedAt time.Time
	UpdatedAt time.Time
	DeletedAt gorm.DeletedAt `gorm:"index"`

	UserID      uint       `gorm:"not null;index" json:"user_id"`
	ServerID    uint       `gorm:"not null;index" json:"server_id"`
	AccessLevel string     `gorm:"not null" json:"access_level"` // e.g., "read", "manage", "full"
	ExpireAt    *time.Time `json:"expire_at"`
}
