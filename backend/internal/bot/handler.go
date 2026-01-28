package bot

import (
	"fmt"
	"time"

	"gopkg.in/telebot.v3"
)

// BotHandler holds the bot instance and configuration
type BotHandler struct {
	Bot       *telebot.Bot
	WebAppURL string // URL where the frontend is hosted, e.g., "https://yourdomain.com/app"
}

// NewBotHandler initializes and returns a new BotHandler
func NewBotHandler(token, webAppURL string) (*BotHandler, error) {
	pref := telebot.Settings{
		Token:  token,
		Poller: &telebot.LongPoller{Timeout: 10 * time.Second},
	}

	b, err := telebot.NewBot(pref)
	if err != nil {
		return nil, fmt.Errorf("failed to create bot: %w", err)
	}

	handler := &BotHandler{
		Bot:       b,
		WebAppURL: webAppURL,
	}

	handler.setupHandlers()
	return handler, nil
}

// setupHandlers registers all command handlers
func (h *BotHandler) setupHandlers() {
	h.Bot.Handle("/start", h.handleStart)
	h.Bot.Handle("/status", h.handleStatus) // Placeholder for status command
}

// handleStart responds to the /start command with a Web App button
func (h *BotHandler) handleStart(c telebot.Context) error {
	// Define the Web App button
	webAppButton := telebot.ReplyMarkup{
		InlineKeyboard: [][]telebot.InlineButton{
			{
				telebot.InlineButton{
					Text: "🚀 Launch DockerManager Web App",
					WebApp: &telebot.WebApp{
						URL: h.WebAppURL,
					},
				},
			},
		},
	}

	message := fmt.Sprintf("Welcome to DockerManager, %s! Use the button below to manage your servers.", c.Sender().FirstName)

	return c.Send(message, &webAppButton)
}

// handleStatus is a placeholder for the /status command
func (h *BotHandler) handleStatus(c telebot.Context) error {
	// In a real implementation, this would query the database and Docker API
	return c.Send("Server status check is not yet implemented. Please launch the Web App for full control.")
}

// Start starts the bot poller
func (h *BotHandler) Start() {
	h.Bot.Start()
}
