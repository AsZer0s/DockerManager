import { theme } from 'antd'

// 主题配置
export const lightTheme = {
  algorithm: theme.defaultAlgorithm,
  token: {
    colorPrimary: '#0072ff',
    colorPrimaryHover: '#2b8eff',
    colorPrimaryActive: '#005fe0',
    colorPrimaryBorder: '#4ca9ff',
    colorBgContainer: 'rgba(255, 255, 255, 0.7)',
    colorBgElevated: 'rgba(255, 255, 255, 0.82)',
    colorBgLayout: 'transparent',
    colorBorder: 'rgba(255, 255, 255, 0.42)',
    colorBorderSecondary: 'rgba(255, 255, 255, 0.28)',
    colorSplit: 'rgba(0, 114, 255, 0.12)',
    colorText: 'rgba(15, 23, 42, 0.9)',
    colorTextSecondary: 'rgba(15, 23, 42, 0.64)',
    colorTextTertiary: 'rgba(15, 23, 42, 0.45)',
    boxShadowSecondary: '0 34px 60px rgba(0, 114, 255, 0.12)',
    borderRadius: 18,
    borderRadiusLG: 22,
    controlHeight: 42,
    fontFamily: `'SF Pro Display', 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`,
  },
  components: {
    Layout: {
      headerBg: 'rgba(255, 255, 255, 0.62)',
      siderBg: 'rgba(255, 255, 255, 0.55)',
      bodyBg: 'transparent',
    },
    Menu: {
      itemBg: 'transparent',
      itemSelectedBg: 'rgba(0, 114, 255, 0.14)',
      itemHoverBg: 'rgba(255, 255, 255, 0.24)',
      colorItemText: 'rgba(15, 23, 42, 0.7)',
      colorItemTextHover: '#0072ff',
      colorItemTextSelected: '#0072ff',
    },
    Card: {
      colorBgContainer: 'rgba(255, 255, 255, 0.72)',
      borderRadiusLG: 22,
      boxShadow: '0 28px 50px rgba(0, 114, 255, 0.15)',
      padding: 20,
    },
    Dropdown: {
      colorBgElevated: 'rgba(255, 255, 255, 0.9)',
      borderRadiusLG: 20,
    },
    Modal: {
      colorBgElevated: 'rgba(255, 255, 255, 0.88)',
      borderRadiusLG: 26,
    },
    Drawer: {
      colorBgElevated: 'rgba(255, 255, 255, 0.88)',
    },
    Button: {
      colorBgContainer: 'rgba(255, 255, 255, 0.85)',
      colorBorder: 'rgba(0, 114, 255, 0.28)',
      borderRadius: 18,
      controlHeight: 42,
    },
    Input: {
      colorBgContainer: 'rgba(255, 255, 255, 0.85)',
      borderRadius: 18,
      colorBorder: 'rgba(0, 114, 255, 0.22)',
    },
    Statistic: {
      titleFontSize: 14,
    },
    Message: {
      contentBg: 'rgba(255, 255, 255, 0.86)',
      contentPadding: '10px 20px',
      colorText: 'rgba(15, 23, 42, 0.9)',
      colorTextSecondary: 'rgba(15, 23, 42, 0.64)',
      colorSuccess: '#15c06a',
      colorError: '#ff4d4f',
      colorWarning: '#f5b73c',
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
    colorBgContainer: 'rgba(13, 23, 46, 0.86)',
    colorBgElevated: 'rgba(15, 27, 52, 0.92)',
    colorBgLayout: 'transparent',
    colorBorder: 'rgba(255, 255, 255, 0.12)',
    colorBorderSecondary: 'rgba(255, 255, 255, 0.08)',
    colorSplit: 'rgba(12, 24, 46, 0.6)',
    colorText: 'rgba(230, 239, 255, 0.94)',
    colorTextSecondary: 'rgba(148, 163, 184, 0.75)',
    colorTextTertiary: 'rgba(148, 163, 184, 0.5)',
    boxShadowSecondary: '0 36px 65px rgba(0, 0, 0, 0.6)',
    borderRadius: 18,
    borderRadiusLG: 22,
    controlHeight: 42,
    fontFamily: `'SF Pro Display', 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`,
  },
  components: {
    Layout: {
      headerBg: 'rgba(13, 23, 46, 0.9)',
      siderBg: 'rgba(12, 21, 40, 0.88)',
      bodyBg: 'transparent',
    },
    Menu: {
      itemBg: 'transparent',
      itemSelectedBg: 'rgba(61, 131, 255, 0.18)',
      itemHoverBg: 'rgba(33, 50, 82, 0.55)',
      colorItemText: 'rgba(226, 233, 249, 0.68)',
      colorItemTextHover: '#63b5ff',
      colorItemTextSelected: '#63b5ff',
    },
    Card: {
      colorBgContainer: 'rgba(15, 27, 52, 0.92)',
      borderRadiusLG: 22,
      boxShadow: '0 34px 65px rgba(0, 0, 0, 0.55)',
      padding: 20,
    },
    Dropdown: {
      colorBgElevated: 'rgba(13, 23, 46, 0.95)',
      borderRadiusLG: 20,
    },
    Modal: {
      colorBgElevated: 'rgba(13, 23, 46, 0.95)',
      borderRadiusLG: 26,
    },
    Drawer: {
      colorBgElevated: 'rgba(13, 23, 46, 0.95)',
    },
    Button: {
      colorBgContainer: 'rgba(20, 32, 58, 0.9)',
      colorBorder: 'rgba(99, 181, 255, 0.35)',
      borderRadius: 18,
      controlHeight: 42,
    },
    Input: {
      colorBgContainer: 'rgba(21, 32, 58, 0.88)',
      borderRadius: 18,
      colorBorder: 'rgba(99, 181, 255, 0.28)',
    },
    Statistic: {
      titleFontSize: 14,
    },
    Message: {
      contentBg: 'rgba(15, 27, 52, 0.94)',
      contentPadding: '10px 20px',
      colorText: 'rgba(230, 239, 255, 0.94)',
      colorTextSecondary: 'rgba(148, 163, 184, 0.75)',
      colorSuccess: '#33d17a',
      colorError: '#ff7875',
      colorWarning: '#f5b73c',
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
