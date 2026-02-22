package main

import (
	"crypto/rand"
	"encoding/hex"
	"io"
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

func setupRouter(db *gorm.DB, cfg Config) http.Handler {
	// Create a Gin router for API routes
	ginRouter := gin.Default()
	ginRouter.Use(middleware.CORSMiddleware())

	// API routes
	public := ginRouter.Group("/api/v1")
	{
		public.POST("/login", handler.Login(db, cfg.JWTSecret))
	}

	auth := ginRouter.Group("/api/v1")
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

		// Telegram WebApp endpoints
		telegram := auth.Group("/telegram")
		{
			telegram.GET("/info", handler.GetTelegramUserInfo(db))
			telegram.GET("/servers", handler.GetTelegramServerList(db))
			telegram.GET("/summary", handler.GetTelegramQuickSummary(db))
			telegram.GET("/servers/:id/stats", handler.GetTelegramServerStats(db))
			telegram.GET("/servers/:id/containers", handler.GetTelegramContainerStatus(db))
		}
	}

	// WebSocket routes
	ws := ginRouter.Group("/ws")
	ws.Use(middleware.AuthMiddleware(db, cfg.JWTSecret))
	{
		ws.GET("/terminal", func(c *gin.Context) {
			websocket.TerminalHandler(c, db)
		})
	}

	// Static files and SPA routes
	staticFS, _ := fs.Sub(staticFiles, "static")

	// Create a custom http.Handler that handles all requests
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		path := r.URL.Path

		// Check if it's an API or WS request
		if strings.HasPrefix(path, "/api/") || strings.HasPrefix(path, "/ws/") {
			// Let Gin handle these
			ginRouter.ServeHTTP(w, r)
			return
		}

		// Try to serve the requested file from staticFS
		// Remove leading slash for fs.Open
		fsPath := strings.TrimPrefix(path, "/")
		f, err := staticFS.Open(fsPath)
		if err == nil {
			// File exists, serve it
			defer f.Close()
			
			// Set appropriate content type based on file extension
			if strings.HasSuffix(path, ".js") {
				w.Header().Set("Content-Type", "application/javascript")
			} else if strings.HasSuffix(path, ".css") {
				w.Header().Set("Content-Type", "text/css")
			} else if strings.HasSuffix(path, ".html") {
				w.Header().Set("Content-Type", "text/html; charset=utf-8")
			} else if strings.HasSuffix(path, ".svg") {
				w.Header().Set("Content-Type", "image/svg+xml")
			}
			
			if _, err := io.Copy(w, f); err != nil {
				log.Printf("Error copying file %s: %v", path, err)
				w.WriteHeader(http.StatusInternalServerError)
				w.Write([]byte("Internal Server Error"))
				return
			}
			return
		}

		// File doesn't exist, serve index.html for SPA routing
		log.Printf("Serving index.html for path: %s", path)
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		
		// Open index.html
		indexFile, err := staticFS.Open("index.html")
		if err != nil {
			log.Printf("Error opening index.html: %v", err)
			w.WriteHeader(http.StatusInternalServerError)
			w.Write([]byte("Internal Server Error"))
			return
		}
		defer indexFile.Close()
		
		// Copy content to response
		if _, err := io.Copy(w, indexFile); err != nil {
			log.Printf("Error copying index.html: %v", err)
			w.WriteHeader(http.StatusInternalServerError)
			w.Write([]byte("Internal Server Error"))
			return
		}
	})
}

func main() {
	log.Println("DockerManager | Verison 1.0.7")
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

	handler := setupRouter(db, cfg)
	log.Printf("Server listening on %s", cfg.ListenAddr)

	s := http.ListenAndServe(cfg.ListenAddr, handler)
	if s != nil {
		log.Fatalf("Server failed to start: %v", s)
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
