package stats

import (
	"docker-pulse/internal/model"
	"docker-pulse/internal/ssh"
	"log"
	"time"

	"gorm.io/gorm"
)

func StartCollector(db *gorm.DB) {
	ticker := time.NewTicker(5 * time.Minute)
	go func() {
		// Run once at start
		collect(db)
		for range ticker.C {
			collect(db)
		}
	}()
}

func collect(db *gorm.DB) {
	var servers []model.Server
	if err := db.Find(&servers).Error; err != nil {
		log.Printf("Collector: failed to fetch servers: %v", err)
		return
	}

	var pingTargets string
	var config model.Config
	if err := db.Where("key = ?", model.ConfigKeyPingTargets).First(&config).Error; err == nil {
		pingTargets = config.Value
	}

	for _, server := range servers {
		go func(s model.Server) {
			sshClient, err := ssh.NewSSHClient(s.IP, s.Port, s.Username, s.AuthMode, s.Secret)
			if err != nil {
				return
			}

			// We only need latency for the history table
			stats, err := sshClient.GetServerRealtimeStats(pingTargets)
			if err != nil {
				return
			}

			now := time.Now()
			for target, lat := range stats.LatencyMap {
				history := model.StatsHistory{
					ServerID:  s.ID,
					Target:    target,
					Latency:   lat,
					Timestamp: now,
				}
				db.Create(&history)
			}

			// Always store at least the aggregate latency if targets are empty or failed
			if len(stats.LatencyMap) == 0 && stats.Latency > 0 {
				history := model.StatsHistory{
					ServerID:  s.ID,
					Target:    "aggregate",
					Latency:   stats.Latency,
					Timestamp: now,
				}
				db.Create(&history)
			}
		}(server)
	}

	// Periodic cleanup of old stats (older than 30 days)
	db.Where("timestamp < ?", time.Now().AddDate(0, 0, -30)).Delete(&model.StatsHistory{})
}
