package model

import "gorm.io/gorm"

// Server represents the server table (servers)
type Server struct {
	gorm.Model
	Name        string `json:"name"`
	IP          string `json:"ip"`
	Port        int    `json:"port" gorm:"default:22"`
	Username    string `json:"username"`
	AuthMode    string `json:"auth_mode"`
	Secret      string `json:"-"`

	// Relationships
	ServerPermissions []ServerPermission `gorm:"foreignKey:ServerID"`
}