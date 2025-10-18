import React from 'react'
import { Toaster } from 'react-hot-toast'
import { useThemeStore } from '../stores/themeStore'

const ThemeToaster: React.FC = () => {
  const { isDark } = useThemeStore()

  return (
    <Toaster
      position="top-right"
      toastOptions={{
        duration: 4000,
        style: {
          background: isDark ? '#1f1f1f' : '#ffffff',
          color: isDark ? '#ffffffd9' : '#000000d9',
          border: 'none',
          boxShadow: isDark 
            ? '0 4px 12px rgba(0, 0, 0, 0.4)' 
            : '0 4px 12px rgba(0, 0, 0, 0.15)',
          borderRadius: '20px',
          padding: '8px 16px',
          fontSize: '14px',
          fontWeight: 'normal',
          lineHeight: '1.4',
        },
        success: {
          iconTheme: {
            primary: isDark ? '#52c41a' : '#52c41a',
            secondary: isDark ? '#1f1f1f' : '#ffffff',
          },
        },
        error: {
          iconTheme: {
            primary: isDark ? '#ff4d4f' : '#ff4d4f',
            secondary: isDark ? '#1f1f1f' : '#ffffff',
          },
        },
        loading: {
          iconTheme: {
            primary: isDark ? '#0072ff' : '#0072ff',
            secondary: isDark ? '#1f1f1f' : '#ffffff',
          },
        },
      }}
    />
  )
}

export default ThemeToaster
