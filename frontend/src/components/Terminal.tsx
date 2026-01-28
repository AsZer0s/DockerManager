import React, { useRef, useEffect, useState } from 'react';
import { Terminal as XTerm } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { WebglAddon } from 'xterm-addon-webgl';
import { AlertCircle, Loader2, WifiOff } from 'lucide-react';
import { useApp } from '../hooks/useApp';
import 'xterm/css/xterm.css';

interface TerminalProps {
  serverId: string;
  containerId?: string; // Optional container ID for container exec
}

type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

const Terminal: React.FC<TerminalProps> = ({ serverId, containerId }) => {
  const { t, theme } = useApp();
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermInstance = useRef<XTerm | null>(null);
  const fitAddon = useRef<FitAddon | null>(null);
  const webglAddon = useRef<WebglAddon | null>(null);
  const websocket = useRef<WebSocket | null>(null);

  const [status, setStatus] = useState<ConnectionStatus>('connecting');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (terminalRef.current) {
      xtermInstance.current = new XTerm({
        fontFamily: '"JetBrains Mono", "Cascadia Code", Menlo, monospace',
        fontSize: 13,
        lineHeight: 1.2,
        cursorBlink: true,
        cursorStyle: 'block',
        scrollback: 1000,
        theme: theme === 'dark' ? {
          background: '#09090b', // zinc-950
          foreground: '#e4e4e7', // zinc-200
          cursor: '#10b981',     // emerald-500
          cursorAccent: '#09090b',
          selectionBackground: 'rgba(16, 185, 129, 0.3)',
          black: '#27272a',
          red: '#fb7185',
          green: '#34d399',
          yellow: '#facc15',
          blue: '#60a5fa',
          magenta: '#e879f9',
          cyan: '#22d3ee',
          white: '#f4f4f5',
          brightBlack: '#52525b',
          brightRed: '#f43f5e',
          brightGreen: '#10b981',
          brightYellow: '#eab308',
          brightBlue: '#3b82f6',
          brightMagenta: '#d946ef',
          brightCyan: '#06b6d4',
          brightWhite: '#ffffff',
        } : {
          background: '#ffffff',
          foreground: '#18181b', // zinc-900
          cursor: '#059669',     // emerald-600
          cursorAccent: '#ffffff',
          selectionBackground: 'rgba(16, 185, 129, 0.2)',
          black: '#f4f4f5',
          red: '#e11d48',
          green: '#059669',
          yellow: '#ca8a04',
          blue: '#2563eb',
          magenta: '#c026d3',
          cyan: '#0891b2',
          white: '#18181b',
          brightBlack: '#71717a',
          brightRed: '#f43f5e',
          brightGreen: '#10b981',
          brightYellow: '#facc15',
          brightBlue: '#60a5fa',
          brightMagenta: '#e879f9',
          brightCyan: '#22d3ee',
          brightWhite: '#000000',
        },
      });

      fitAddon.current = new FitAddon();
      xtermInstance.current.loadAddon(fitAddon.current);

      try {
        const webgl = new WebglAddon();
        webgl.onContextLoss(() => {
          webgl.dispose();
        });
        xtermInstance.current.loadAddon(webgl);
        webglAddon.current = webgl;
      } catch (e) {
        console.warn('WebGL Addon could not be loaded', e);
      }

      xtermInstance.current.open(terminalRef.current);

      setTimeout(() => {
        fitAddon.current?.fit();
      }, 100);

      const handleResize = () => {
        fitAddon.current?.fit();
        if (websocket.current && websocket.current.readyState === WebSocket.OPEN) {
          const { cols, rows } = xtermInstance.current!;
          websocket.current.send(JSON.stringify({ type: 'resize', cols, rows }));
        }
      };
      window.addEventListener('resize', handleResize);

      const token = localStorage.getItem('jwt_token');
      if (!token) {
        setStatus('error');
        setErrorMessage(t('auth_token_missing'));
        xtermInstance.current.write(`\r\n\x1b[31mError: ${t('auth_token_missing')}\x1b[0m\r\n`);
        return;
      }

      const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
      const host = window.location.host;
      const containerParam = containerId ? `&container_id=${containerId}` : '';
      const wsUrl = `${protocol}://${host}/ws/terminal?server_id=${serverId}${containerParam}&token=${token}`;

      try {
        websocket.current = new WebSocket(wsUrl);

        websocket.current.onopen = () => {
          setStatus('connected');
          handleResize();
          xtermInstance.current?.write(`\x1b[32m${t('connection_established')}\x1b[0m\r\n`);
          xtermInstance.current?.write(`\x1b[2m${t('initializing_secure_shell')}\x1b[0m\r\n\r\n`);
        };

        websocket.current.onmessage = (event) => {
          xtermInstance.current?.write(event.data);
        };

        websocket.current.onclose = (event) => {
          setStatus('disconnected');
          if (event.code !== 1000) {
            setErrorMessage(`${t('error')} (Code: ${event.code})`);
          }
          xtermInstance.current?.write(`\r\n\x1b[33m${t('disconnected_from_remote')}\x1b[0m\r\n`);
        };

        websocket.current.onerror = (err) => {
          setStatus('error');
          console.error('WebSocket error:', err);
          xtermInstance.current?.write(`\r\n\x1b[31m${t('connection_error_occurred')}\x1b[0m\r\n`);
        };

        xtermInstance.current.onData((data) => {
          if (websocket.current && websocket.current.readyState === WebSocket.OPEN) {
            websocket.current.send(JSON.stringify({ type: 'input', data }));
          }
        });

      } catch (err: any) {
        setStatus('error');
        setErrorMessage(err.message || t('unexpected_error'));
      }

      return () => {
        window.removeEventListener('resize', handleResize);
        if (websocket.current) {
          websocket.current.close();
        }

        // Explicitly dispose WebGL addon first to prevent render loop errors
        try {
          webglAddon.current?.dispose();
          webglAddon.current = null;
        } catch (e) {
          // Ignore disposal errors
        }

        try {
          xtermInstance.current?.dispose();
        } catch (e) {
          // Ignore disposal errors
        }
        xtermInstance.current = null;
      };
    }
  }, [serverId, theme]);

  return (
    <div className="relative h-full w-full bg-white dark:bg-[#09090b] px-1 pb-1"> {/* Tiny padding for borders */}

      {/* 状态遮罩层 (Connecting / Error) */}
      {status !== 'connected' && status !== 'disconnected' && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-white/90 dark:bg-[#09090b]/90 backdrop-blur-sm transition-all duration-300">
          {status === 'connecting' && (
            <>
              <Loader2 className="w-10 h-10 text-emerald-500 animate-spin mb-4" />
              <p className="text-zinc-400 font-mono text-sm tracking-wider animate-pulse">
                {t('establishing_uplink')}
              </p>
            </>
          )}

          {status === 'error' && (
            <>
              <div className="bg-rose-500/10 p-4 rounded-full mb-4 border border-rose-500/20">
                <AlertCircle className="w-8 h-8 text-rose-500" />
              </div>
              <p className="text-rose-600 dark:text-rose-400 font-bold mb-1">{t('connection_failed')}</p>
              <p className="text-zinc-500 dark:text-zinc-500 text-sm max-w-xs text-center">{errorMessage}</p>
            </>
          )}
        </div>
      )}

      {/* 断开连接后的遮罩层 */}
      {status === 'disconnected' && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-white/80 dark:bg-[#09090b]/80 backdrop-blur-[2px] pointer-events-none">
          <WifiOff className="w-12 h-12 text-zinc-400 dark:text-zinc-600 mb-2 opacity-50" />
          <p className="text-zinc-400 dark:text-zinc-500 font-mono text-sm">{t('session_terminated')}</p>
        </div>
      )}

      {/* Terminal Container */}
      <div className="h-full w-full overflow-hidden rounded bg-white dark:bg-[#09090b] relative">
        {/* 装饰：扫描线效果 (Scanlines) */}
        <div className="absolute inset-0 pointer-events-none z-10 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.1)_50%),linear-gradient(90deg,rgba(255,0,0,0.03),rgba(0,255,0,0.01),rgba(0,0,255,0.03))] bg-[length:100%_3px,3px_100%] opacity-20"></div>

        {/* Xterm Inject Point */}
        <div ref={terminalRef} className="h-full w-full pl-2 pt-1" />
      </div>

      {/* 右下角状态指示标 */}
      <div className="absolute bottom-4 right-6 z-30 opacity-50 hover:opacity-100 transition-opacity">
        <div className={`flex items-center gap-2 px-2 py-1 rounded text-[10px] font-mono border ${status === 'connected'
          ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500'
          : 'bg-zinc-800 border-zinc-700 text-zinc-500'
          }`}>
          <div className={`w-1.5 h-1.5 rounded-full ${status === 'connected' ? 'bg-emerald-500 animate-pulse' : 'bg-zinc-500'
            }`} />
          {t(status as any).toUpperCase()}
        </div>
      </div>

    </div>
  );
};

export default Terminal;