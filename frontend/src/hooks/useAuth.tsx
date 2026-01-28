import React, { useState, useEffect, createContext, useContext, ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { jwtDecode } from 'jwt-decode';

interface User {
  id: number;
  username: string;
  role: string;
  telegram_id?: number; // Make telegram_id optional
  last_login?: string | null; // Make last_login optional
}

interface AuthContextType {
  isAuthenticated: boolean;
  user: User | null;
  login: (token: string) => void;
  logout: () => void;
  setUser: React.Dispatch<React.SetStateAction<User | null>>; // Add setUser to context
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

const decodeToken = (token: string): User | null => {
  try {
    const decoded: any = jwtDecode(token);
    return {
      id: decoded.user_id, // Assuming the token payload has 'user_id'
      username: decoded.username,
      role: decoded.role,
    };
  } catch (error) {
    console.error('Failed to decode JWT:', error);
    return null;
  }
};

export const AuthProvider = ({ children }: AuthProviderProps): JSX.Element => {
  const [user, setUser] = useState<User | null>(() => {
    const token = localStorage.getItem('jwt_token');
    return token ? decodeToken(token) : null;
  });
  const navigate = useNavigate();

  const isAuthenticated = !!user;

  const login = (token: string) => {
    localStorage.setItem('jwt_token', token);
    const decodedUser = decodeToken(token);
    setUser(decodedUser);
    navigate('/');
  };

  // Add setUser to the context provider
  // This allows other components to update the user state directly
  // For example, after binding Telegram ID

  const logout = () => {
    localStorage.removeItem('jwt_token');
    setUser(null);
    navigate('/login');
  };

  useEffect(() => {
    const token = localStorage.getItem('jwt_token');
    if (token) {
      const decodedUser = decodeToken(token);
      if (!decodedUser) {
        logout();
      } else {
        setUser(decodedUser);
      }
    }
  }, [navigate]);

  return (
    <AuthContext.Provider value={{ isAuthenticated, user, login, logout, setUser }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};