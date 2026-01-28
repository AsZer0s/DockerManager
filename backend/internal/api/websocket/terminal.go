package websocket

import (
	"fmt"
	"io"
	"log"
	"net/http"
	"strconv"
	"sync"

	"bytes"
	"docker-pulse/internal/model"
	internalssh "docker-pulse/internal/ssh" // Alias internal ssh package
	"encoding/json"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
	"golang.org/x/crypto/ssh" // Import the standard ssh package
	"gorm.io/gorm"
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin: func(r *http.Request) bool {
		return true // Allow all origins for development
	},
}

// WebSocketMessage represents the structure of messages sent over WebSocket
type WebSocketMessage struct {
	Type string `json:"type"`
	Data string `json:"data,omitempty"`
	Cols int    `json:"cols,omitempty"`
	Rows int    `json:"rows,omitempty"`
}

// TerminalHandler upgrades the HTTP connection to WebSocket and pipes it to SSH
func TerminalHandler(c *gin.Context, db *gorm.DB) {
	w := c.Writer
	r := c.Request

	// 1. Get Authentication info from context
	currentUserIDInt, _ := c.Get("userID")
	currentUserID := currentUserIDInt.(uint)
	currentUserRoleInt, _ := c.Get("role")
	currentUserRole := currentUserRoleInt.(string)

	// 2. Get Server Info and Container ID from DB
	serverIDStr := r.URL.Query().Get("server_id")
	containerID := r.URL.Query().Get("container_id")

	if serverIDStr == "" {
		http.Error(w, "server_id required", http.StatusBadRequest)
		return
	}

	serverID, err := strconv.ParseUint(serverIDStr, 10, 32)
	if err != nil {
		http.Error(w, "invalid server ID", http.StatusBadRequest)
		return
	}

	// Permission check
	if currentUserRole != "admin" {
		var permission model.ServerPermission
		if err := db.Where("user_id = ? AND server_id = ?", currentUserID, serverID).First(&permission).Error; err != nil {
			http.Error(w, "access denied", http.StatusForbidden)
			return
		}

		// Regular users must have at least 'manage' or 'full' access to use terminal
		if permission.AccessLevel != model.AccessLevelManage && permission.AccessLevel != model.AccessLevelFull {
			http.Error(w, "insufficient permissions: 'manage' access required for terminal", http.StatusForbidden)
			return
		}

		// Host terminal (containerID == "") is restricted to admins or maybe specific 'host' permission?
		// For now, if no containerID, we only allow admins to access host shell.
		if containerID == "" {
			http.Error(w, "host shell access restricted to administrators", http.StatusForbidden)
			return
		}
	}

	var server model.Server
	if err := db.First(&server, uint(serverID)).Error; err != nil {
		http.Error(w, "server not found", http.StatusNotFound)
		return
	}

	wsConn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("Failed to upgrade websocket: %v", err)
		return
	}
	defer wsConn.Close()

	// 2. Establish SSH Connection to the host
	sshClient, err := internalssh.NewSSHClient(server.IP, server.Port, server.Username, server.AuthMode, server.Secret)
	if err != nil {
		wsConn.WriteMessage(websocket.TextMessage, []byte(fmt.Sprintf("Error: failed to initialize SSH client: %v\n", err)))
		return
	}

	session, client, err := sshClient.CreateSession()
	if err != nil {
		wsConn.WriteMessage(websocket.TextMessage, []byte(fmt.Sprintf("Error: failed to create SSH session: %v\n", err)))
		return
	}
	defer client.Close()
	defer session.Close()

	// 3. Request PTY
	modes := ssh.TerminalModes{
		ssh.ECHO:          1,
		ssh.TTY_OP_ISPEED: 14400,
		ssh.TTY_OP_OSPEED: 14400,
	}

	if err := session.RequestPty("xterm-256color", 80, 40, modes); err != nil {
		wsConn.WriteMessage(websocket.TextMessage, []byte(fmt.Sprintf("Error: failed to request PTY: %v\n", err)))
		return
	}

	stdinPipe, err := session.StdinPipe()
	if err != nil {
		wsConn.WriteMessage(websocket.TextMessage, []byte(fmt.Sprintf("Error: failed to get stdin pipe: %v\n", err)))
		return
	}
	stdoutPipe, err := session.StdoutPipe()
	if err != nil {
		wsConn.WriteMessage(websocket.TextMessage, []byte(fmt.Sprintf("Error: failed to get stdout pipe: %v\n", err)))
		return
	}

	// 4. Determine shell and start command
	var startCmd string
	if containerID != "" {
		// Connect to container's shell
		var shellCmd string
		// Try bash
		_, err = sshClient.ExecuteCommand(fmt.Sprintf("docker exec %s bash -c 'exit'", containerID))
		if err == nil {
			shellCmd = "bash"
		} else {
			// Try sh
			_, err = sshClient.ExecuteCommand(fmt.Sprintf("docker exec %s sh -c 'exit'", containerID))
			if err == nil {
				shellCmd = "sh"
			} else {
				wsConn.WriteMessage(websocket.TextMessage, []byte(fmt.Sprintf("Error: neither bash nor sh found in container %s\n", containerID)))
				return
			}
		}
		startCmd = fmt.Sprintf("docker exec -it %s %s", containerID, shellCmd)
	} else {
		// Connect to host's shell (default behavior if no containerID)
		startCmd = "bash" // Default to bash for host, could also add detection here
		_, err = sshClient.ExecuteCommand("bash -c 'exit'")
		if err != nil {
			startCmd = "sh"
			_, err = sshClient.ExecuteCommand("sh -c 'exit'")
			if err != nil {
				wsConn.WriteMessage(websocket.TextMessage, []byte("Error: neither bash nor sh found on host\n"))
				return
			}
		}
	}

	if err := session.Start(startCmd); err != nil {
		wsConn.WriteMessage(websocket.TextMessage, []byte(fmt.Sprintf("Error: failed to start command: %v\n", err)))
		return
	}

	// 5. Pipe Data
	var wg sync.WaitGroup
	wg.Add(2)

	// SSH -> WebSocket
	go func() {
		defer wg.Done()
		_, err := io.Copy(wsWriter{wsConn}, stdoutPipe)
		if err != nil && err != io.EOF {
			log.Printf("Error copying from SSH to WebSocket: %v", err)
		}
	}()

	// WebSocket -> SSH (handle structured messages)
	go func() {
		defer wg.Done()
		for {
			_, p, err := wsConn.ReadMessage()
			if err != nil {
				if websocket.IsCloseError(err, websocket.CloseNormalClosure, websocket.CloseGoingAway) {
					// Normal closure, exit loop
					break
				}
				log.Printf("Error reading WebSocket message: %v", err)
				break
			}

			var msg WebSocketMessage
			if err := json.Unmarshal(p, &msg); err != nil {
				log.Printf("Error unmarshaling WebSocket message: %v", err)
				continue
			}

			switch msg.Type {
			case "input":
				if _, err := stdinPipe.Write([]byte(msg.Data)); err != nil {
					log.Printf("Error writing to stdin pipe: %v", err)
				}
			case "resize":
				if err := session.WindowChange(msg.Rows, msg.Cols); err != nil {
					log.Printf("Error resizing SSH terminal: %v", err)
				}
			default:
				log.Printf("Unknown WebSocket message type: %s", msg.Type)
			}
		}
	}()

	wg.Wait()
	session.Wait() // Wait for the SSH session to close
}

// wsReader is used to adapt WebSocket connection to io.Reader interface
type wsReader struct {
	ws  *websocket.Conn
	buf bytes.Buffer
}

func (w *wsReader) Read(p []byte) (n int, err error) {
	if w.buf.Len() == 0 {
		_, message, err := w.ws.ReadMessage()
		if err != nil {
			if websocket.IsCloseError(err, websocket.CloseNormalClosure, websocket.CloseGoingAway) {
				return 0, io.EOF
			}
			return 0, err
		}
		w.buf.Write(message)
	}
	return w.buf.Read(p)
}

type wsWriter struct {
	ws *websocket.Conn
}

func (w wsWriter) Write(p []byte) (n int, err error) {
	err = w.ws.WriteMessage(websocket.TextMessage, p)
	if err != nil {
		return 0, err
	}
	return len(p), nil
}
