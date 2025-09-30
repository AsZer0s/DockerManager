import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { settingsAPI } from '../services/api'
import { applyTheme, getEffectiveTheme, watchSystemTheme, type ThemeMode } from '../utils/theme'

interface ThemeState {
  themeMode: ThemeMode
  isDark: boolean
  setThemeMode: (mode: ThemeMode) => void
  toggleTheme: () => void
  initializeTheme: () => void
  saveThemeToServer: (mode: ThemeMode) => Promise<void>
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      themeMode: 'light',
      isDark: false,
      
      setThemeMode: (mode: ThemeMode) => {
        set({ themeMode: mode })
        const isDark = getEffectiveTheme(mode) === 'dark'
        set({ isDark })
        applyTheme(mode)
      },
      
      toggleTheme: () => {
        const { themeMode } = get()
        const newMode: ThemeMode = themeMode === 'light' ? 'dark' : 'light'
        get().setThemeMode(newMode)
        get().saveThemeToServer(newMode)
      },
      
      initializeTheme: () => {
        const { themeMode } = get()
        const isDark = getEffectiveTheme(themeMode) === 'dark'
        set({ isDark })
        applyTheme(themeMode)
        
        // 监听系统主题变化（仅在auto模式下）
        if (themeMode === 'auto') {
          const cleanup = watchSystemTheme((systemTheme) => {
            const isDark = systemTheme === 'dark'
            set({ isDark })
            applyTheme(themeMode)
          })
          
          // 返回清理函数（虽然这里没有直接使用，但可以用于组件卸载时清理）
          return cleanup
        }
      },
      
      saveThemeToServer: async (mode: ThemeMode) => {
        try {
          // 获取当前系统设置
          const currentSettings = await settingsAPI.getSystemSettings()
          const settings = currentSettings.data.settings
          
          // 更新主题设置
          const updatedSettings = {
            ...settings,
            theme: mode
          }
          
          // 保存到服务器
          await settingsAPI.updateSystemSettings(updatedSettings)
        } catch (error) {
          console.error('保存主题设置失败:', error)
        }
      }
    }),
    {
      name: 'theme-storage',
      partialize: (state) => ({ themeMode: state.themeMode }),
    }
  )
)
