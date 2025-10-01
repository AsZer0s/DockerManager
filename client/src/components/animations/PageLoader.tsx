import React from 'react';
import { motion } from 'framer-motion';
import { Spin } from 'antd';
import { LoadingOutlined } from '@ant-design/icons';

interface PageLoaderProps {
  loading?: boolean;
  text?: string;
  size?: 'small' | 'default' | 'large';
  className?: string;
}

export const PageLoader: React.FC<PageLoaderProps> = ({
  loading = true,
  text = '加载中...',
  size = 'large',
  className = ''
}) => {
  if (!loading) return null;

  return (
    <motion.div
      className={`fixed inset-0 bg-white bg-opacity-90 flex flex-col items-center justify-center z-50 ${className}`}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
    >
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.4, delay: 0.1 }}
        className="text-center"
      >
        <Spin
          indicator={<LoadingOutlined style={{ fontSize: 48, color: '#1890ff' }} spin />}
          size={size}
        />
        <motion.div
          className="mt-4 text-lg text-gray-600"
          initial={{ y: 10, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.4, delay: 0.3 }}
        >
          {text}
        </motion.div>
      </motion.div>
    </motion.div>
  );
};

// 页面切换加载器
export const PageTransitionLoader: React.FC<{
  isVisible: boolean;
  text?: string;
}> = ({ isVisible, text = '页面切换中...' }) => {
  return (
    <motion.div
      className="fixed inset-0 bg-gradient-to-br from-blue-50 to-purple-50 flex items-center justify-center z-50"
      initial={{ opacity: 0 }}
      animate={{ opacity: isVisible ? 1 : 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      style={{ display: isVisible ? 'flex' : 'none' }}
    >
      <motion.div
        className="text-center"
        initial={{ scale: 0.8, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <motion.div
          className="w-16 h-16 mx-auto mb-4 rounded-full bg-gradient-to-r from-blue-500 to-purple-600 flex items-center justify-center"
          animate={{ rotate: 360 }}
          transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
        >
          <motion.div
            className="w-8 h-8 rounded-full bg-white"
            animate={{ scale: [1, 1.2, 1] }}
            transition={{ duration: 1.5, repeat: Infinity }}
          />
        </motion.div>
        <motion.div
          className="text-xl font-medium text-gray-700"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
        >
          {text}
        </motion.div>
      </motion.div>
    </motion.div>
  );
};

// 数据加载骨架屏
export const DataSkeleton: React.FC<{
  rows?: number;
  className?: string;
}> = ({ rows = 3, className = '' }) => {
  return (
    <div className={`space-y-4 ${className}`}>
      {Array.from({ length: rows }).map((_, index) => (
        <motion.div
          key={index}
          className="flex space-x-4"
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: index * 0.1 }}
        >
          <motion.div
            className="w-12 h-12 bg-gray-200 rounded-lg"
            animate={{ opacity: [0.5, 1, 0.5] }}
            transition={{ duration: 1.5, repeat: Infinity, delay: index * 0.2 }}
          />
          <div className="flex-1 space-y-2">
            <motion.div
              className="h-4 bg-gray-200 rounded w-3/4"
              animate={{ opacity: [0.5, 1, 0.5] }}
              transition={{ duration: 1.5, repeat: Infinity, delay: index * 0.2 }}
            />
            <motion.div
              className="h-3 bg-gray-200 rounded w-1/2"
              animate={{ opacity: [0.5, 1, 0.5] }}
              transition={{ duration: 1.5, repeat: Infinity, delay: index * 0.2 + 0.1 }}
            />
          </div>
        </motion.div>
      ))}
    </div>
  );
};

// 表格加载骨架屏
export const TableSkeleton: React.FC<{
  columns?: number;
  rows?: number;
  className?: string;
}> = ({ columns = 4, rows = 5, className = '' }) => {
  return (
    <div className={`space-y-3 ${className}`}>
      {/* 表头 */}
      <div className="flex space-x-4">
        {Array.from({ length: columns }).map((_, index) => (
          <motion.div
            key={index}
            className="h-6 bg-gray-200 rounded flex-1"
            animate={{ opacity: [0.5, 1, 0.5] }}
            transition={{ duration: 1.5, repeat: Infinity, delay: index * 0.1 }}
          />
        ))}
      </div>
      {/* 表格行 */}
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <motion.div
          key={rowIndex}
          className="flex space-x-4"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: rowIndex * 0.1 }}
        >
          {Array.from({ length: columns }).map((_, colIndex) => (
            <motion.div
              key={colIndex}
              className="h-4 bg-gray-200 rounded flex-1"
              animate={{ opacity: [0.5, 1, 0.5] }}
              transition={{ 
                duration: 1.5, 
                repeat: Infinity, 
                delay: rowIndex * 0.1 + colIndex * 0.05 
              }}
            />
          ))}
        </motion.div>
      ))}
    </div>
  );
};
