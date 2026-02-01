package main

import (
	"crypto/rand"
	"encoding/hex"
	"log"
	"os"
	"time"

	"docker-pulse/internal/api/handler"
	"docker-pulse/internal/api/middleware"
	"docker-pulse/internal/api/websocket"
	"docker-pulse/internal/bot"
	"docker-pulse/internal/model"
	"docker-pulse/internal/stats"

	"embed"
	"io/fs"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

//go:embed static
var staticFiles embed.FS

const (
	jwtSecretFile = "data/.sk"
)

type Config struct {
	JWTSecret  string
	BotToken   string
	WebAppURL  string
	ListenAddr string
}

func getConfigValue(db *gorm.DB, key string) string {
	var config model.Config
	db.Where("key = ?", key).First(&config)
	return config.Value
}

func loadConfig(db *gorm.DB) Config {
	jwtSecret := loadOrCreateJWTSecret()

	botToken := getConfigValue(db, model.ConfigKeyTelegramBotToken)
	webAppURL := getConfigValue(db, model.ConfigKeyTelegramWebAppURL)

	if botToken == "" {
		log.Println("Telegram Bot Token is not configured in DB. Bot will not start.")
	}

	return Config{
		JWTSecret:  jwtSecret,
		BotToken:   botToken,
		WebAppURL:  webAppURL,
		ListenAddr: ":9090",
	}
}

func loadOrCreateJWTSecret() string {
	secretBytes, err := os.ReadFile(jwtSecretFile)
	if err != nil {
		if os.IsNotExist(err) {
			log.Println("JWT secret file not found, generating a new one...")
			newSecret, err := generateRandomString(32)
			if err != nil {
				log.Fatalf("failed to generate JWT secret: %v", err)
			}
			err = os.WriteFile(jwtSecretFile, []byte(newSecret), 0600)
			if err != nil {
				log.Fatalf("failed to write JWT secret to file: %v", err)
			}
			log.Printf("Generated and saved new JWT secret to %s", jwtSecretFile)
			return newSecret
		}
		log.Fatalf("failed to read JWT secret file: %v", err)
	}
	log.Printf("Loaded JWT secret from %s", jwtSecretFile)
	return string(secretBytes)
}

func generateRandomString(length int) (string, error) {
	bytes := make([]byte, length)
	if _, err := rand.Read(bytes); err != nil {
		return "", err
	}
	return hex.EncodeToString(bytes), nil
}

func initDB() *gorm.DB {
	newLogger := logger.New(
		log.New(os.Stdout, "\r\n", log.LstdFlags),
		logger.Config{
			SlowThreshold:             time.Second,
			LogLevel:                  logger.Warn,
			IgnoreRecordNotFoundError: true,
			Colorful:                  false,
		},
	)

	db, err := gorm.Open(sqlite.Open("data/dockerpulse.db"), &gorm.Config{
		Logger: newLogger,
	})
	if err != nil {
		log.Fatalf("failed to connect database: %v", err)
	}

	db.AutoMigrate(&model.User{}, &model.Server{}, &model.ServerPermission{}, &model.Config{}, &model.StatsHistory{})

	var count int64
	db.Model(&model.User{}).Count(&count)
	if count == 0 {
		admin := model.User{
			Username: "admin",
			Password: "admin123",
			Role:     "admin",
		}
		db.Create(&admin)
		log.Println("Created initial admin user. Password: 'admin123'")
	}

	return db
}

func setupRouter(db *gorm.DB, cfg Config) *gin.Engine {
	r := gin.Default()

	r.Use(middleware.CORSMiddleware())

	public := r.Group("/api/v1")
	{
		public.POST("/login", handler.Login(db, cfg.JWTSecret))
	}

	auth := r.Group("/api/v1")
	auth.Use(middleware.AuthMiddleware(db, cfg.JWTSecret))
	{
		// Server Management
		auth.GET("/servers", handler.ListServers(db))
		auth.GET("/servers/:id", handler.GetServer(db))
		auth.POST("/servers", middleware.RoleCheck("admin"), handler.CreateServer(db))
		auth.PUT("/servers/:id", middleware.RoleCheck("admin"), handler.UpdateServer(db))
		auth.DELETE("/servers/:id", middleware.RoleCheck("admin"), handler.DeleteServer(db))
		auth.GET("/servers/:id/stats", handler.GetServerStats(db))
		auth.GET("/servers/stats/history", handler.GetStatsHistory(db))

		// Container Management
		auth.GET("/servers/:id/containers", handler.ListContainers(db))
		auth.POST("/servers/:id/containers/action", handler.ContainerAction(db))
		auth.GET("/servers/:id/containers/:containerID/logs", handler.GetContainerLogs(db))
		auth.GET("/servers/:id/containers/:containerID/details", handler.GetContainerDetails(db))
		auth.GET("/servers/:id/containers/:containerID/check-update", handler.CheckContainerImageUpdate(db))

		// Container File Management
		auth.GET("/servers/:id/containers/:containerID/files", handler.ListContainerFiles(db))
		auth.GET("/servers/:id/containers/:containerID/files/content", handler.GetContainerFileContent(db))

		// User Management
		auth.GET("/users", middleware.RoleCheck("admin"), handler.ListUsers(db))
		auth.POST("/users", middleware.RoleCheck("admin"), handler.CreateUser(db))
		auth.PUT("/users/:id", middleware.RoleCheck("admin"), handler.UpdateUser(db))
		auth.DELETE("/users/:id", middleware.RoleCheck("admin"), handler.DeleteUser(db))
		auth.PUT("/users/:id/reset-password", middleware.RoleCheck("admin"), handler.ResetUserPassword(db))

		// User Permissions
		auth.GET("/users/:id/permissions", middleware.RoleCheck("admin"), handler.GetUserPermissions(db))
		auth.PUT("/users/:id/permissions", middleware.RoleCheck("admin"), handler.UpdateUserPermissions(db))

		// Self-service routes
		auth.PUT("/users/change-password", handler.ChangePassword(db))
		auth.POST("/users/bind-telegram", handler.BindTelegram(db, cfg.BotToken))

		// Config Management
		auth.GET("/config/telegram", middleware.RoleCheck("admin"), handler.GetTelegramConfig(db))
		auth.PUT("/config/telegram", middleware.RoleCheck("admin"), handler.UpdateTelegramConfig(db))
		auth.GET("/config/latency", middleware.RoleCheck("admin"), handler.GetLatencyConfig(db))
		auth.PUT("/config/latency", middleware.RoleCheck("admin"), handler.UpdateLatencyConfig(db))
	}

	ws := r.Group("/ws")
	ws.Use(middleware.AuthMiddleware(db, cfg.JWTSecret))
	{
		ws.GET("/terminal", func(c *gin.Context) {
			websocket.TerminalHandler(c, db)
		})
	}

	// Static files serving
	staticFS, _ := fs.Sub(staticFiles, "static")
	fileServer := http.FileServer(http.FS(staticFS))

	r.NoRoute(func(c *gin.Context) {
		path := c.Request.URL.Path
		// If the path starts with /api/ or /ws/, don't serve static files
		if strings.HasPrefix(path, "/api/") || strings.HasPrefix(path, "/ws/") {
			c.JSON(404, gin.H{"error": "Not Found"})
			return
		}

		// Check if file exists in staticFS
		f, err := staticFS.Open(strings.TrimPrefix(path, "/"))
		if err == nil {
			f.Close()
			fileServer.ServeHTTP(c.Writer, c.Request)
			return
		}

		// Otherwise serve index.html for SPA routing
		c.FileFromFS("index.html", http.FS(staticFS))
	})

	return r
}

func main() {
	db := initDB()
	cfg := loadConfig(db)
	stats.StartCollector(db)

	if cfg.BotToken != "" {
		botHandler, err := bot.NewBotHandler(cfg.BotToken, cfg.WebAppURL)
		if err != nil {
			log.Fatalf("Failed to initialize Telegram Bot: %v", err)
		}
		go botHandler.Start()
		log.Println("Telegram Bot started.")
	} else {
		log.Println("Telegram Bot Token not configured in DB. Skipping Telegram Bot initialization.")
	}

	r := setupRouter(db, cfg)
	log.Printf("Gin API listening on %s", cfg.ListenAddr)

	s := r.Run(cfg.ListenAddr)
	if s != nil {
		log.Fatalf("Gin server failed to start: %v", s)
	}
}

func CORSMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Writer.Header().Set("Access-Control-Allow-Origin", "*")
		c.Writer.Header().Set("Access-Control-Allow-Credentials", "true")
		c.Writer.Header().Set("Access-Control-Allow-Headers", "Content-Type, Content-Length, Accept-Encoding, X-CSRF-Token, Authorization, accept, origin, Cache-Control, X-Requested-With")
		c.Writer.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS, GET, PUT, DELETE")

		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}

		c.Next()
	}
}
