package ssh

import (
	"bytes"
	"docker-pulse/internal/model"
	"encoding/json"
	"fmt"
	"log"
	"net"
	"os/exec"
	"runtime"
	"strconv"
	"strings"
	"time"

	"golang.org/x/crypto/ssh"
)

type SSHClient struct {
	Config *ssh.ClientConfig
	Addr   string
}

type ServerStats struct {
	Status            string             `json:"status"`
	CPUUsage          float64            `json:"cpu_usage"`
	RAMUsage          float64            `json:"ram_usage"`
	DockerVersion     string             `json:"docker_version"`
	Uptime            string             `json:"uptime"`
	RunningContainers int                `json:"running_containers"`
	TotalContainers   int                `json:"total_containers"`
	Latency           float64            `json:"latency"`
	LatencyMap        map[string]float64 `json:"latency_map"`
}

func NewSSHClient(ip string, port int, username, authMode, secret string) (*SSHClient, error) {
	var authMethods []ssh.AuthMethod

	switch authMode {
	case "password":
		authMethods = append(authMethods, ssh.Password(secret))
	case "key":
		signer, err := ssh.ParsePrivateKey([]byte(secret))
		if err != nil {
			return nil, fmt.Errorf("failed to parse SSH private key: %v", err)
		}
		authMethods = append(authMethods, ssh.PublicKeys(signer))
	default:
		return nil, fmt.Errorf("unsupported authentication mode: %s", authMode)
	}

	config := &ssh.ClientConfig{
		User:            username,
		Auth:            authMethods,
		HostKeyCallback: ssh.InsecureIgnoreHostKey(),
		Timeout:         10 * time.Second,
	}
	return &SSHClient{
		Config: config,
		Addr:   fmt.Sprintf("%s:%d", ip, port),
	}, nil
}

func (s *SSHClient) CreateSession() (*ssh.Session, *ssh.Client, error) {
	client, err := ssh.Dial("tcp", s.Addr, s.Config)
	if err != nil {
		return nil, nil, err
	}

	session, err := client.NewSession()
	if err != nil {
		client.Close()
		return nil, nil, err
	}
	return session, client, nil
}

func (s *SSHClient) CheckConnectivity() bool {
	client, err := ssh.Dial("tcp", s.Addr, s.Config)
	if err != nil {
		return false
	}
	defer client.Close()
	return true
}

func (s *SSHClient) GetDockerInfo() (*ServerStats, error) {
	session, client, err := s.CreateSession()
	if err != nil {
		return nil, err
	}
	defer session.Close()
	defer client.Close()

	var stdoutBuf bytes.Buffer
	session.Stdout = &stdoutBuf

	// Use docker info to get version and container counts, and uptime for system uptime
	err = session.Run("docker info --format '{{.ServerVersion}}|{{.ContainersRunning}}|{{.Containers}}' && uptime -p")
	if err != nil {
		return &ServerStats{Status: "offline"}, nil
	}

	output := stdoutBuf.String()
	lines := strings.Split(strings.TrimSpace(output), "\n")
	stats := &ServerStats{Status: "online", DockerVersion: "Unknown", Uptime: "N/A"}

	if len(lines) >= 2 {
		dockerParts := strings.Split(lines[0], "|")
		if len(dockerParts) >= 3 {
			stats.DockerVersion = strings.TrimSpace(dockerParts[0])
			stats.RunningContainers, _ = strconv.Atoi(strings.TrimSpace(dockerParts[1]))
			stats.TotalContainers, _ = strconv.Atoi(strings.TrimSpace(dockerParts[2]))
		}
		stats.Uptime = strings.TrimSpace(lines[1])
	}
	return stats, nil
}

func (s *SSHClient) GetSystemStats() (float64, float64, error) {
	session, client, err := s.CreateSession()
	if err != nil {
		return 0, 0, err
	}
	defer session.Close()
	defer client.Close()

	var stdoutBuf bytes.Buffer
	session.Stdout = &stdoutBuf
	cpuCmd := "top -bn1 | grep 'Cpu(s)' | sed 's/.*, *\\([0-9.]*\\)%* id.*/\\1/' | awk '{print 100 - $1}'"
	if err := session.Run(cpuCmd); err != nil {
		return 0, 0, err
	}
	cpu, _ := strconv.ParseFloat(strings.TrimSpace(stdoutBuf.String()), 64)

	stdoutBuf.Reset()
	session2, client2, err := s.CreateSession()
	if err != nil {
		return cpu, 0, err
	}
	defer session2.Close()
	defer client2.Close()
	session2.Stdout = &stdoutBuf
	ramCmd := "free | grep Mem | awk '{print $3/$2 * 100.0}'"
	if err := session2.Run(ramCmd); err != nil {
		return cpu, 0, err
	}
	ram, _ := strconv.ParseFloat(strings.TrimSpace(stdoutBuf.String()), 64)

	return cpu, ram, nil
}

func (s *SSHClient) GetServerRealtimeStats(pingTargets string) (*ServerStats, error) {
	stats := &ServerStats{Status: "offline"}

	// Measure latency
	type TargetInfo struct {
		Name string `json:"name"`
		Host string `json:"host"`
	}
	var targets []TargetInfo

	if pingTargets != "" && strings.HasPrefix(pingTargets, "[") {
		// New JSON format
		if err := json.Unmarshal([]byte(pingTargets), &targets); err != nil {
			log.Printf("SSH: failed to unmarshal ping targets: %v", err)
		}
	}

	if len(targets) == 0 {
		// Fallback to legacy or default
		host, _, _ := net.SplitHostPort(s.Addr)
		if host == "" {
			host = s.Addr
		}
		if pingTargets != "" && !strings.HasPrefix(pingTargets, "[") {
			// Comma-separated legacy format
			for _, t := range strings.Split(pingTargets, ",") {
				t = strings.TrimSpace(t)
				if t != "" {
					targets = append(targets, TargetInfo{Name: t, Host: t})
				}
			}
		} else {
			targets = append(targets, TargetInfo{Name: "Self", Host: host})
		}
	}

	var totalLatency float64
	var count int
	stats.LatencyMap = make(map[string]float64)
	for _, t := range targets {
		l := MeasureLatency(t.Host)
		stats.LatencyMap[t.Name] = l
		if l > 0 {
			totalLatency += l
			count++
		}
	}
	if count > 0 {
		stats.Latency = totalLatency / float64(count)
	}

	if !s.CheckConnectivity() {
		return stats, nil
	}
	stats.Status = "online"

	di, _ := s.GetDockerInfo()
	if di != nil {
		stats.DockerVersion = di.DockerVersion
		stats.Uptime = di.Uptime
		stats.RunningContainers = di.RunningContainers
		stats.TotalContainers = di.TotalContainers
	}

	cpu, ram, _ := s.GetSystemStats()
	stats.CPUUsage = cpu
	stats.RAMUsage = ram

	return stats, nil
}

func MeasureLatency(target string) float64 {
	start := time.Now()

	// Try ICMP ping first via os/exec
	var cmd *exec.Cmd
	if runtime.GOOS == "windows" {
		cmd = exec.Command("ping", "-n", "1", "-w", "1000", target)
	} else {
		cmd = exec.Command("ping", "-c", "1", "-W", "1", target)
	}

	err := cmd.Run()
	if err == nil {
		return float64(time.Since(start).Milliseconds())
	}

	// Fallback to TCP check if ICMP fails (common in restricted environments)
	// We try common ports if no port specified
	ports := []string{"80", "443", "22"}
	for _, p := range ports {
		conn, err := net.DialTimeout("tcp", net.JoinHostPort(target, p), time.Second)
		if err == nil {
			conn.Close()
			return float64(time.Since(start).Milliseconds())
		}
	}

	return 0
}

func (s *SSHClient) GetContainers() (string, error) {
	session, client, err := s.CreateSession()
	if err != nil {
		return "", err
	}
	defer session.Close()
	defer client.Close()

	var stdoutBuf bytes.Buffer
	session.Stdout = &stdoutBuf
	cmd := "docker ps -a --format '{{.ID}}|{{.Names}}|{{.Image}}|{{.Status}}|{{.State}}|{{.Ports}}|{{.CreatedAt}}'"
	if err := session.Run(cmd); err != nil {
		return "", err
	}
	return stdoutBuf.String(), nil
}

func (s *SSHClient) ExecuteContainerAction(containerID, action string) error {
	session, client, err := s.CreateSession()
	if err != nil {
		return err
	}
	defer session.Close()
	defer client.Close()

	var cmd string
	switch action {
	case "start":
		cmd = fmt.Sprintf("docker start %s", containerID)
	case "stop":
		cmd = fmt.Sprintf("docker stop %s", containerID)
	case "restart":
		cmd = fmt.Sprintf("docker restart %s", containerID)
	case "remove":
		cmd = fmt.Sprintf("docker rm -f %s", containerID)
	case "pull": // This is for updating the image
		// We'll handle image pull separately if needed, but for the "update" button,
		// usually we pull then recreate. For now, just pull.
		return s.PullImageByContainer(containerID)
	default:
		return fmt.Errorf("unsupported action")
	}

	return session.Run(cmd)
}

func (s *SSHClient) PullImageByContainer(containerID string) error {
	session, client, err := s.CreateSession()
	if err != nil {
		return err
	}
	defer session.Close()
	defer client.Close()

	var stdoutBuf bytes.Buffer
	session.Stdout = &stdoutBuf
	// Get image name first
	inspectCmd := fmt.Sprintf("docker inspect --format '{{.Config.Image}}' %s", containerID)
	if err := session.Run(inspectCmd); err != nil {
		return err
	}
	imageName := strings.TrimSpace(stdoutBuf.String())

	stdoutBuf.Reset()
	session2, client2, err := s.CreateSession()
	if err != nil {
		return err
	}
	defer session2.Close()
	defer client2.Close()
	return session2.Run(fmt.Sprintf("docker pull %s", imageName))
}

func (s *SSHClient) ExecuteCommand(cmd string) (string, error) {
	session, client, err := s.CreateSession()
	if err != nil {
		return "", err
	}
	defer session.Close()
	defer client.Close()

	var stdoutBuf bytes.Buffer
	var stderrBuf bytes.Buffer
	session.Stdout = &stdoutBuf
	session.Stderr = &stderrBuf

	err = session.Run(cmd)
	output := stdoutBuf.String()
	stderr := stderrBuf.String()

	if err != nil {
		fullOutput := output
		if stderr != "" {
			if fullOutput != "" {
				fullOutput += "\n"
			}
			fullOutput += stderr
		}
		return fullOutput, fmt.Errorf("command failed: %v, output: %s", err, fullOutput)
	}
	return output, nil
}

func (s *SSHClient) GetContainerLogs(containerID, tail string) (string, error) {
	session, client, err := s.CreateSession()
	if err != nil {
		return "", err
	}
	defer session.Close()
	defer client.Close()

	var stdoutBuf bytes.Buffer
	session.Stdout = &stdoutBuf
	cmd := fmt.Sprintf("docker logs --tail %s %s", tail, containerID)
	if err := session.Run(cmd); err != nil {
		return "", err
	}
	return stdoutBuf.String(), nil
}

func (s *SSHClient) GetContainerDetails(containerID string) (string, error) {
	session, client, err := s.CreateSession()
	if err != nil {
		return "", err
	}
	defer session.Close()
	defer client.Close()

	var stdoutBuf bytes.Buffer
	session.Stdout = &stdoutBuf
	cmd := fmt.Sprintf("docker inspect %s", containerID)
	if err := session.Run(cmd); err != nil {
		return "", err
	}
	return stdoutBuf.String(), nil
}

func (s *SSHClient) CheckForImageUpdate(containerID string) (bool, error) {
	session, client, err := s.CreateSession()
	if err != nil {
		return false, err
	}
	defer session.Close()
	defer client.Close()

	var stdoutBuf bytes.Buffer
	session.Stdout = &stdoutBuf

	// 1. Get image name
	if err := session.Run(fmt.Sprintf("docker inspect --format '{{.Config.Image}}' %s", containerID)); err != nil {
		return false, err
	}
	imageName := strings.TrimSpace(stdoutBuf.String())
	stdoutBuf.Reset()

	// 2. Get local digest
	session2, client2, _ := s.CreateSession()
	defer session2.Close()
	defer client2.Close()
	session2.Stdout = &stdoutBuf
	if err := session2.Run(fmt.Sprintf("docker inspect --format '{{index .RepoDigests 0}}' %s", imageName)); err != nil {
		return true, nil // If can't inspect local image digest, assume update might be needed
	}
	localDigest := strings.TrimSpace(stdoutBuf.String())
	stdoutBuf.Reset()

	// 3. Try to get remote digest (requires docker manifest or experimental)
	// Fallback: Use a simpler check or just return false for now to avoid overhead if manifest is missing
	// For this task, I'll implement a basic check using `docker manifest inspect`
	session3, client3, _ := s.CreateSession()
	defer session3.Close()
	defer client3.Close()
	session3.Stdout = &stdoutBuf
	remoteCmd := fmt.Sprintf("docker manifest inspect %s 2>/dev/null | jq -r '.RepoDigests[0]' 2>/dev/null || echo ''", imageName)
	_ = session3.Run(remoteCmd)
	remoteDigest := strings.TrimSpace(stdoutBuf.String())

	if remoteDigest != "" && localDigest != "" && remoteDigest != localDigest {
		return true, nil
	}

	return false, nil
}

// Helper function to convert symbolic mode string to octal permissions string
func modeToOctal(mode string) string {
	if len(mode) < 10 {
		return ""
	}

	// Only consider the 9 permission bits (rwx rwx rwx)
	perms := mode[1:10]

	var octal string
	for i := 0; i < 9; i += 3 {
		r := perms[i] == 'r'
		w := perms[i+1] == 'w'
		x := perms[i+2] == 'x'

		val := 0
		if r {
			val += 4
		}
		if w {
			val += 2
		}
		if x {
			val += 1
		}
		octal += strconv.Itoa(val)
	}
	return octal
}

func (s *SSHClient) ListContainerFiles(containerID, path string) ([]model.FileEntry, error) {
	// Use sh -c to try multiple ls variants for compatibility (Alpine/BusyBox vs GNU)
	// We prefer long-iso for easier parsing if available.
	cmd := fmt.Sprintf("docker exec %s sh -c \"ls -la --time-style=long-iso %s 2>/dev/null || ls -la %s\"", containerID, path, path)
	output, err := s.ExecuteCommand(cmd)
	if err != nil {
		// Check for specific common failures
		if strings.Contains(output, "is not running") {
			return nil, fmt.Errorf("container is not running")
		}
		if strings.Contains(output, "executable file not found") {
			return nil, fmt.Errorf("ls command not found in container (minimal image)")
		}
		return nil, err
	}

	lines := strings.Split(output, "\n")
	var files []model.FileEntry

	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "total") {
			continue
		}

		parts := strings.Fields(line)
		if len(parts) < 7 {
			continue
		}

		mode := parts[0]
		isDir := strings.HasPrefix(mode, "d")
		isSymlink := strings.HasPrefix(mode, "l")
		size, _ := strconv.ParseInt(parts[4], 10, 64)

		// Find where the name starts and attempt to parse the date
		// Standard ls -la formats:
		// GNU long-iso: [perms] [links] [user] [group] [size] [YYYY-MM-DD] [HH:MM] [name] (8 fields)
		// Standard: [perms] [links] [user] [group] [size] [Mon] [Day] [Year/Time] [name] (9 fields)
		// BusyBox: [perms] [links] [user] [group] [size] [Mon] [Day] [Time] [name] (9 fields)

		var name string
		var modTime time.Time

		// Heuristic to handle different field counts
		if len(parts) >= 8 && strings.Contains(parts[5], "-") {
			// Likely long-iso: 2024-01-27 06:17
			dateStr := parts[5] + " " + parts[6]
			modTime, _ = time.Parse("2006-01-02 15:04", dateStr)
			name = strings.Join(parts[7:], " ")
		} else if len(parts) >= 9 {
			// Likely standard: Jan 27 06:17 or Jan 27 2024
			dateStr := parts[5] + " " + parts[6] + " " + parts[7]
			// Try parsing both common formats
			modTime, err = time.Parse("Jan _2 15:04", dateStr)
			if err != nil {
				modTime, _ = time.Parse("Jan _2 2006", dateStr)
			}
			// If it's a recent file, it won't have the year. Default to current year.
			if modTime.Year() == 0 {
				modTime = modTime.AddDate(time.Now().Year(), 0, 0)
			}
			name = strings.Join(parts[8:], " ")
		} else {
			// Fallback: name is just the last part, and we can't be sure about the date
			name = parts[len(parts)-1]
		}

		if isSymlink {
			if idx := strings.Index(name, " -> "); idx != -1 {
				name = name[:idx]
			}
		}

		if name == "." || name == ".." {
			continue
		}

		files = append(files, model.FileEntry{
			Name:        name,
			Size:        size,
			Mode:        mode,
			IsDir:       isDir,
			IsSymlink:   isSymlink,
			ModTime:     modTime,
			Permissions: modeToOctal(mode),
		})
	}

	return files, nil
}

func (s *SSHClient) GetContainerFileContent(containerID, path string) (string, error) {
	// Use 'cat' to read file content
	cmd := fmt.Sprintf("docker exec %s cat %s", containerID, path)
	output, err := s.ExecuteCommand(cmd)
	if err != nil {
		// If cat fails (e.g., directory or binary file), return the error message
		return "", fmt.Errorf("failed to read file content: %v", err)
	}
	return output, nil
}
