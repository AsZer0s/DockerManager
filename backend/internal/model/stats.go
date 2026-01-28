package model

import "time"

type StatsHistory struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	ServerID  uint      `gorm:"index" json:"server_id"`
	Target    string    `gorm:"index" json:"target"` // The ping target
	Latency   float64   `json:"latency"`
	Timestamp time.Time `gorm:"index" json:"timestamp"`
}
