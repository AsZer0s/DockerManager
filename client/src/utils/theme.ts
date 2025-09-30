import { theme } from 'antd'

// 主题配置
export const lightTheme = {
  algorithm: theme.defaultAlgorithm,
  token: {
    colorPrimary: '#1890ff',
    colorBgContainer: '#ffffff',
    colorBgElevated: '#ffffff',
    colorBgLayout: '#f5f5f5',
    colorText: '#000000d9',
    colorTextSecondary: '#00000073',
    colorTextTertiary: '#00000040',
    colorBorder: '#d9d9d9',
    colorBorderSecondary: '#f0f0f0',
    borderRadius: 6,
  },
  components: {
    Layout: {
      headerBg: '#ffffff',
      siderBg: '#ffffff',
      bodyBg: '#f5f5f5',
    },
    Menu: {
      itemBg: 'transparent',
      itemSelectedBg: '#e6f7ff',
      itemHoverBg: '#f5f5f5',
    },
    Card: {
      colorBgContainer: '#ffffff',
    },
    Message: {
      contentBg: '#ffffff',
      contentPadding: '8px 16px',
      colorText: '#000000d9',
      colorTextSecondary: '#00000073',
      colorSuccess: '#52c41a',
      colorError: '#ff4d4f',
      colorWarning: '#faad14',
      colorInfo: '#1890ff',
    },
  },
}

export const darkTheme = {
  algorithm: theme.darkAlgorithm,
  token: {
    colorPrimary: '#177ddc',
    colorBgContainer: '#141414',
    colorBgElevated: '#1f1f1f',
    colorBgLayout: '#000000',
    colorText: '#ffffffd9',
    colorTextSecondary: '#ffffff73',
    colorTextTertiary: '#ffffff40',
    colorBorder: '#424242',
    colorBorderSecondary: '#303030',
    borderRadius: 6,
  },
  components: {
    Layout: {
      headerBg: '#141414',
      siderBg: '#141414',
      bodyBg: '#000000',
    },
    Menu: {
      itemBg: 'transparent',
      itemSelectedBg: '#111b26',
      itemHoverBg: '#1f1f1f',
    },
    Card: {
      colorBgContainer: '#141414',
    },
    Message: {
      contentBg: '#1f1f1f',
      contentPadding: '8px 16px',
      colorText: '#ffffffd9',
      colorTextSecondary: '#ffffff73',
      colorSuccess: '#73d13d',
      colorError: '#ff7875',
      colorWarning: '#ffc53d',
      colorInfo: '#177ddc',
    },
  },
}

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
