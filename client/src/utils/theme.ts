import { theme } from 'antd'

// 主题配置
export const lightTheme = {
  algorithm: theme.defaultAlgorithm,
  token: {
    colorPrimary: '#0072ff',
    colorPrimaryHover: '#3690ff',
    colorPrimaryActive: '#0057d9',
    colorPrimaryBorder: '#8bc8ff',
    colorBgContainer: 'rgba(255, 255, 255, 0.86)',
    colorBgElevated: 'rgba(255, 255, 255, 0.92)',
    colorBgLayout: 'transparent',
    colorBorder: 'rgba(0, 114, 255, 0.18)',
    colorBorderSecondary: 'rgba(0, 114, 255, 0.12)',
    colorSplit: 'rgba(0, 114, 255, 0.12)',
    colorText: '#0f1c3f',
    colorTextSecondary: 'rgba(15, 28, 63, 0.68)',
    colorTextTertiary: 'rgba(15, 28, 63, 0.48)',
    boxShadowSecondary: '0 32px 64px rgba(0, 114, 255, 0.16)',
    borderRadius: 18,
    borderRadiusLG: 22,
    controlHeight: 44,
    fontFamily: `'SF Pro Display', 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`,
  },
  components: {
    Layout: {
      headerBg: 'rgba(255, 255, 255, 0.78)',
      siderBg: 'rgba(255, 255, 255, 0.74)',
      bodyBg: 'transparent',
    },
    Menu: {
      itemBg: 'transparent',
      itemSelectedBg: 'rgba(0, 114, 255, 0.22)',
      itemHoverBg: 'rgba(0, 114, 255, 0.1)',
      colorItemText: 'rgba(15, 28, 63, 0.68)',
      colorItemTextHover: '#0f1c3f',
      colorItemTextSelected: '#ffffff',
    },
    Card: {
      colorBgContainer: 'rgba(255, 255, 255, 0.9)',
      borderRadiusLG: 22,
      boxShadow: '0 32px 64px rgba(0, 114, 255, 0.16)',
      padding: 20,
    },
    Dropdown: {
      colorBgElevated: 'rgba(255, 255, 255, 0.95)',
      borderRadiusLG: 20,
    },
    Modal: {
      colorBgElevated: 'rgba(255, 255, 255, 0.95)',
      borderRadiusLG: 26,
    },
    Drawer: {
      colorBgElevated: 'rgba(255, 255, 255, 0.95)',
    },
    Button: {
      colorBgContainer: 'rgba(255, 255, 255, 0.92)',
      colorBorder: 'rgba(0, 114, 255, 0.22)',
      borderRadius: 18,
      controlHeight: 44,
    },
    Input: {
      colorBgContainer: 'rgba(255, 255, 255, 0.92)',
      borderRadius: 18,
      colorBorder: 'rgba(0, 114, 255, 0.22)',
    },
    Statistic: {
      titleFontSize: 14,
    },
    Message: {
      contentBg: 'rgba(255, 255, 255, 0.95)',
      contentPadding: '10px 20px',
      colorText: '#0f1c3f',
      colorTextSecondary: 'rgba(15, 28, 63, 0.6)',
      colorSuccess: '#16a34a',
      colorError: '#dc2626',
      colorWarning: '#d97706',
      colorInfo: '#0072ff',
    },
  },
};

export const darkTheme = {
  algorithm: theme.darkAlgorithm,
  token: {
    colorPrimary: '#4da9ff',
    colorPrimaryHover: '#63b5ff',
    colorPrimaryActive: '#1f7eff',
    colorPrimaryBorder: '#63b5ff',
    colorBgContainer: 'rgba(12, 20, 40, 0.88)',
    colorBgElevated: 'rgba(18, 28, 52, 0.92)',
    colorBgLayout: 'transparent',
    colorBorder: 'rgba(93, 161, 255, 0.28)',
    colorBorderSecondary: 'rgba(93, 161, 255, 0.16)',
    colorSplit: 'rgba(21, 36, 68, 0.6)',
    colorText: 'rgba(229, 239, 255, 0.95)',
    colorTextSecondary: 'rgba(195, 214, 245, 0.75)',
    colorTextTertiary: 'rgba(195, 214, 245, 0.45)',
    boxShadowSecondary: '0 36px 76px rgba(0, 0, 0, 0.6)',
    borderRadius: 18,
    borderRadiusLG: 22,
    controlHeight: 44,
    fontFamily: `'SF Pro Display', 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`,
  },
  components: {
    Layout: {
      headerBg: 'rgba(18, 28, 52, 0.92)',
      siderBg: 'rgba(12, 20, 40, 0.88)',
      bodyBg: 'transparent',
    },
    Menu: {
      itemBg: 'transparent',
      itemSelectedBg: 'rgba(61, 131, 255, 0.24)',
      itemHoverBg: 'rgba(45, 104, 196, 0.32)',
      colorItemText: 'rgba(214, 225, 247, 0.88)',
      colorItemTextHover: '#f5f9ff',
      colorItemTextSelected: '#f5f9ff',
    },
    Card: {
      colorBgContainer: 'rgba(18, 28, 52, 0.92)',
      borderRadiusLG: 22,
      boxShadow: '0 36px 76px rgba(0, 0, 0, 0.6)',
      padding: 20,
    },
    Dropdown: {
      colorBgElevated: 'rgba(12, 20, 40, 0.95)',
      borderRadiusLG: 20,
    },
    Modal: {
      colorBgElevated: 'rgba(12, 20, 40, 0.95)',
      borderRadiusLG: 26,
    },
    Drawer: {
      colorBgElevated: 'rgba(12, 20, 40, 0.95)',
    },
    Button: {
      colorBgContainer: 'rgba(21, 32, 58, 0.9)',
      colorBorder: 'rgba(99, 181, 255, 0.32)',
      borderRadius: 18,
      controlHeight: 44,
    },
    Input: {
      colorBgContainer: 'rgba(21, 32, 58, 0.9)',
      borderRadius: 18,
      colorBorder: 'rgba(99, 181, 255, 0.28)',
    },
    Statistic: {
      titleFontSize: 14,
    },
    Message: {
      contentBg: 'rgba(18, 28, 52, 0.95)',
      contentPadding: '10px 20px',
      colorText: 'rgba(229, 239, 255, 0.95)',
      colorTextSecondary: 'rgba(195, 214, 245, 0.68)',
      colorSuccess: '#34d399',
      colorError: '#f87171',
      colorWarning: '#fbbf24',
      colorInfo: '#63b5ff',
    },
  },
};

// 主题类型
export type ThemeMode = 'light' | 'dark' | 'auto'

// 获取系统主题偏好
export const getSystemTheme = (): 'light' | 'dark' => {
  if (typeof window !== 'undefined' && window.matchMedia) {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }
  return 'light'
}

// 获取当前有效主题
export const getEffectiveTheme = (themeMode: ThemeMode): 'light' | 'dark' => {
  if (themeMode === 'auto') {
    return getSystemTheme()
  }
  return themeMode
}

// 应用主题到HTML根元素
export const applyTheme = (themeMode: ThemeMode) => {
  const effectiveTheme = getEffectiveTheme(themeMode)
  const html = document.documentElement
  
  if (effectiveTheme === 'dark') {
    html.classList.add('dark')
    html.classList.remove('light')
  } else {
    html.classList.add('light')
    html.classList.remove('dark')
  }
  
  // 设置data属性供CSS使用
  html.setAttribute('data-theme', effectiveTheme)
}

// 监听系统主题变化
export const watchSystemTheme = (callback: (theme: 'light' | 'dark') => void) => {
  if (typeof window !== 'undefined' && window.matchMedia) {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    
    const handleChange = (e: MediaQueryListEvent) => {
      callback(e.matches ? 'dark' : 'light')
    }
    
    mediaQuery.addEventListener('change', handleChange)
    
    // 返回清理函数
    return () => {
      mediaQuery.removeEventListener('change', handleChange)
    }
  }
  
  return () => {}
}
