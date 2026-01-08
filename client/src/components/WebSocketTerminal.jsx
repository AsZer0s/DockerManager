import React, { useState, useEffect, useRef } from 'react';
import { useWebSocket, useSSHSession } from '../hooks/useWebSocket';
import './WebSocketTerminal.css';

/**
 * WebSocket 终端组件
 * 提供实时的 SSH 终端体验
 */
const WebSocketTerminal = ({ serverId, serverName, onClose }) => {
  const { isConnected, connect, client } = useWebSocket();
  const { sessions, outputs, createSession, executeCommand, sendInput, closeSession, clearOutput } = useSSHSession();
  
  const [sessionId, setSessionId] = useState(null);
  const [currentCommand, setCurrentCommand] = useState('');
  const [commandHistory, setCommandHistory] = useState([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [isLoading, setIsLoading] = useState(false);
  const [terminalSize, setTerminalSize] = useState({ cols: 80, rows: 24 });
  
  const terminalRef = useRef(null);
  const inputRef = useRef(null);
  const outputRef = useRef(null);

  // 自动连接 WebSocket
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token && !isConnected) {
      connect(token).catch(error => {
        console.error('WebSocket 连接失败:', error);
      });
    }
  }, [isConnected, connect]);

  // 创建 SSH 会话
  useEffect(() => {
    if (isConnected && serverId && !sessionId) {
      handleCreateSession();
    }
  }, [isConnected, serverId, sessionId]);

  // 自动滚动到底部
  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [outputs.get(sessionId)]);

  // 监听终端大小变化
  useEffect(() => {
    const handleResize = () => {
      if (terminalRef.current) {
        const rect = terminalRef.current.getBoundingClientRect();
        const cols = Math.floor(rect.width / 8); // 假设字符宽度为8px
        const rows = Math.floor(rect.height / 16); // 假设行高为16px
        
        if (cols !== terminalSize.cols || rows !== terminalSize.rows) {
          setTerminalSize({ cols, rows });
          
          // 通知服务器调整终端大小
          if (sessionId && client) {
            client.resizeTerminal(sessionId, cols, rows).catch(error => {
              console.error('调整终端大小失败:', error);
            });
          }
        }
      }
    };

    window.addEventListener('resize', handleResize);
    handleResize(); // 初始调用

    return () => window.removeEventListener('resize', handleResize);
  }, [sessionId, terminalSize, client]);

  const handleCreateSession = async () => {
    try {
      setIsLoading(true);
      const newSessionId = await createSession(serverId);
      setSessionId(newSessionId);
      
      // 发送欢迎消息
      setTimeout(() => {
        executeCommand(newSessionId, 'echo "欢迎使用 WebSocket 终端！输入命令开始操作..."');
      }, 1000);
      
    } catch (error) {
      console.error('创建 SSH 会话失败:', error);
      alert('创建 SSH 会话失败: ' + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleExecuteCommand = async (command) => {
    if (!sessionId || !command.trim()) return;

    try {
      // 添加到历史记录
      setCommandHistory(prev => [...prev, command]);
      setHistoryIndex(-1);
      
      // 执行命令
      await executeCommand(sessionId, command);
      setCurrentCommand('');
      
    } catch (error) {
      console.error('执行命令失败:', error);
    }
  };

  const handleKeyDown = (e) => {
    switch (e.key) {
      case 'Enter':
        e.preventDefault();
        handleExecuteCommand(currentCommand);
        break;
        
      case 'ArrowUp':
        e.preventDefault();
        if (commandHistory.length > 0) {
          const newIndex = historyIndex === -1 ? commandHistory.length - 1 : Math.max(0, historyIndex - 1);
          setHistoryIndex(newIndex);
          setCurrentCommand(commandHistory[newIndex]);
        }
        break;
        
      case 'ArrowDown':
        e.preventDefault();
        if (historyIndex !== -1) {
          const newIndex = historyIndex + 1;
          if (newIndex >= commandHistory.length) {
            setHistoryIndex(-1);
            setCurrentCommand('');
          } else {
            setHistoryIndex(newIndex);
            setCurrentCommand(commandHistory[newIndex]);
          }
        }
        break;
        
      case 'Tab':
        e.preventDefault();
        // TODO: 实现命令补全
        break;
        
      case 'c':
        if (e.ctrlKey) {
          e.preventDefault();
          // 发送 Ctrl+C
          if (sessionId && client) {
            sendInput(sessionId, '\x03');
          }
        }
        break;
        
      case 'l':
        if (e.ctrlKey) {
          e.preventDefault();
          // 清屏
          if (sessionId) {
            clearOutput(sessionId);
          }
        }
        break;
    }
  };

  const handleClose = async () => {
    if (sessionId) {
      try {
        await closeSession(sessionId);
      } catch (error) {
        console.error('关闭会话失败:', error);
      }
    }
    onClose?.();
  };

  const currentOutput = outputs.get(sessionId) || '';
  const currentSession = sessions.find(s => s.sessionId === sessionId);

  return (
    <div className="websocket-terminal">
      <div className="terminal-header">
        <div className="terminal-title">
          <span className="server-name">{serverName}</span>
          <span className="session-info">
            {isConnected ? (
              <span className="status connected">● 已连接</span>
            ) : (
              <span className="status disconnected">● 未连接</span>
            )}
          </span>
        </div>
        <div className="terminal-controls">
          <button 
            className="btn-clear" 
            onClick={() => sessionId && clearOutput(sessionId)}
            title="清屏 (Ctrl+L)"
          >
            清屏
          </button>
          <button 
            className="btn-close" 
            onClick={handleClose}
            title="关闭终端"
          >
            ✕
          </button>
        </div>
      </div>

      <div 
        ref={terminalRef}
        className="terminal-container"
      >
        <div 
          ref={outputRef}
          className="terminal-output"
        >
          {isLoading ? (
            <div className="loading">正在连接到服务器...</div>
          ) : (
            <pre>{currentOutput}</pre>
          )}
        </div>

        <div className="terminal-input-line">
          <span className="prompt">
            {currentSession ? `root@${serverName}:~$ ` : '$ '}
          </span>
          <input
            ref={inputRef}
            type="text"
            className="terminal-input"
            value={currentCommand}
            onChange={(e) => setCurrentCommand(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={!sessionId || isLoading}
            placeholder={sessionId ? "输入命令..." : "等待连接..."}
            autoFocus
          />
        </div>
      </div>

      <div className="terminal-footer">
        <div className="terminal-info">
          <span>会话: {sessionId || '无'}</span>
          <span>大小: {terminalSize.cols}x{terminalSize.rows}</span>
          <span>历史: {commandHistory.length} 条命令</span>
        </div>
        <div className="terminal-shortcuts">
          <span>快捷键: Enter=执行 | ↑↓=历史 | Ctrl+C=中断 | Ctrl+L=清屏</span>
        </div>
      </div>
    </div>
  );
};

export default WebSocketTerminal;