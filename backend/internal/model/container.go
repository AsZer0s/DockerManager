package model

import (
	"time"
)

// Container represents a Docker container
type Container struct {
	ID         string    `json:"id"`
	ServerID   uint      `json:"server_id"`
	Name       string    `json:"name"`
	Image      string    `json:"image"`
	Status     string    `json:"status"`
	State      string    `json:"state"`
	Ports      []string  `json:"ports"`
	CreatedAt  time.Time `json:"created_at"`
	UserID     uint      `json:"user_id"` // Owner of the container
	Permission string    `json:"permission"` // e.g., "read", "write", "admin"
}

// ContainerListResponse is the response structure for listing containers
type ContainerListResponse struct {
	Containers []Container `json:"containers"`
	Total      int         `json:"total"`
}

// ContainerActionRequest is the request structure for container actions (start, stop, restart, remove)
type ContainerActionRequest struct {
	ServerID    uint   `json:"server_id"`
	ContainerID string `json:"container_id"`
	Action      string `json:"action"` // "start", "stop", "restart", "remove"
}

// ContainerLogRequest is the request structure for fetching container logs
type ContainerLogRequest struct {
	ServerID    uint   `json:"server_id"`
	ContainerID string `json:"container_id"`
	Tail        string `json:"tail"` // "all" or a number of lines
}

// ContainerLogResponse is the response structure for container logs
type ContainerLogResponse struct {
	Logs string `json:"logs"`
}

// FileEntry represents a file or directory within a container
type FileEntry struct {
	Name        string    `json:"name"`
	Size        int64     `json:"size"`
	Mode        string    `json:"mode"` // e.g., "drwxr-xr-x"
	IsDir       bool      `json:"is_dir"`
	IsSymlink   bool      `json:"is_symlink"` // New field to indicate if it's a symbolic link
	ModTime     time.Time `json:"mod_time"`
	Permissions string    `json:"permissions"` // e.g., "755"
}

// FileListResponse is the response structure for listing files
type FileListResponse struct {
	Path  string      `json:"path"`
	Files []FileEntry `json:"files"`
}

// FileContentResponse is the response structure for file content
type FileContentResponse struct {
	Path    string `json:"path"`
	Content string `json:"content"`
}
