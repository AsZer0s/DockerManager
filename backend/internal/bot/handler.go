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
	h.Bot.Handle("/info", h.handleInfo)
	h.Bot.Handle("/servers", h.handleServers)
	h.Bot.Handle("/summary", h.handleSummary)
	h.Bot.Handle("/status", h.handleStatus)
	h.Bot.Handle("/help", h.handleHelp)
}

// handleStart responds to the /start command with a Web App button
func (h *BotHandler) handleStart(c telebot.Context) error {
	webAppButton := telebot.ReplyMarkup{
		InlineKeyboard: [][]telebot.InlineButton{
			{
				telebot.InlineButton{
					Text: "🚀 Launch Web App",
					WebApp: &telebot.WebApp{
						URL: h.WebAppURL,
					},
				},
			},
		},
	}

	message := fmt.Sprintf("👋 欢迎使用 DockerManager，%s！\n\n📊 可用命令：\n/start - 打开 Web 应用\n/info - 查看用户信息\n/servers - 查看服务器列表\n/summary - 快速摘要\n/help - 帮助信息", c.Sender().FirstName)

	return c.Send(message, &webAppButton)
}

// handleInfo responds to the /info command with user information
func (h *BotHandler) handleInfo(c telebot.Context) error {
	webAppButton := telebot.ReplyMarkup{
		InlineKeyboard: [][]telebot.InlineButton{
			{
				telebot.InlineButton{
					Text: "🚀 打开详细信息",
					WebApp: &telebot.WebApp{
						URL: h.WebAppURL,
					},
				},
			},
		},
	}

	message := "👤 用户信息\n\n请点击下方按钮在 Web 应用中查看详细信息。"

	return c.Send(message, &webAppButton)
}

// handleServers responds to the /servers command with server list
func (h *BotHandler) handleServers(c telebot.Context) error {
	webAppButton := telebot.ReplyMarkup{
		InlineKeyboard: [][]telebot.InlineButton{
			{
				telebot.InlineButton{
					Text: "🖥️ 查看服务器列表",
					WebApp: &telebot.WebApp{
						URL: h.WebAppURL,
					},
				},
			},
		},
	}

	message := "🖥️ 服务器列表\n\n请点击下方按钮在 Web 应用中查看服务器列表和详细信息。"

	return c.Send(message, &webAppButton)
}

// handleSummary responds to the /summary command with quick summary
func (h *BotHandler) handleSummary(c telebot.Context) error {
	webAppButton := telebot.ReplyMarkup{
		InlineKeyboard: [][]telebot.InlineButton{
			{
				telebot.InlineButton{
					Text: "📊 查看摘要",
					WebApp: &telebot.WebApp{
						URL: h.WebAppURL,
					},
				},
			},
		},
	}

	message := "📊 快速摘要\n\n请点击下方按钮在 Web 应用中查看系统摘要。"

	return c.Send(message, &webAppButton)
}

// handleStatus is a placeholder for the /status command
func (h *BotHandler) handleStatus(c telebot.Context) error {
	webAppButton := telebot.ReplyMarkup{
		InlineKeyboard: [][]telebot.InlineButton{
			{
				telebot.InlineButton{
					Text: "🚀 打开 Web App",
					WebApp: &telebot.WebApp{
						URL: h.WebAppURL,
					},
				},
			},
		},
	}

	message := "📈 服务器状态\n\n请点击下方按钮在 Web 应用中查看详细的服务器状态。"

	return c.Send(message, &webAppButton)
}

// handleHelp responds to the /help command
func (h *BotHandler) handleHelp(c telebot.Context) error {
	webAppButton := telebot.ReplyMarkup{
		InlineKeyboard: [][]telebot.InlineButton{
			{
				telebot.InlineButton{
					Text: "🚀 打开 Web App",
					WebApp: &telebot.WebApp{
						URL: h.WebAppURL,
					},
				},
			},
		},
	}

	message := "❓ DockerManager 帮助\n\n📋 可用命令：\n/start - 打开 Web 应用\n/info - 查看用户信息\n/servers - 查看服务器列表\n/summary - 快速摘要\n/status - 服务器状态\n/help - 显示此帮助信息\n\n💡 提示：所有详细信息都可以通过 Web 应用查看。"

	return c.Send(message, &webAppButton)
}

// Start starts the bot poller
func (h *BotHandler) Start() {
	h.Bot.Start()
}
