import React from 'react';
import { motion } from 'framer-motion';

// 旋转加载器
export const SpinningLoader: React.FC<{
  size?: number;
  color?: string;
  className?: string;
}> = ({ size = 40, color = '#1890ff', className = '' }) => {
  return (
    <motion.div
      className={className}
      style={{ width: size, height: size }}
      animate={{ rotate: 360 }}
      transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="12" cy="12" r="10" opacity="0.3" />
        <path d="M12 2a10 10 0 0 1 10 10" />
      </svg>
    </motion.div>
  );
};

// 脉冲加载器
export const PulseLoader: React.FC<{
  size?: number;
  color?: string;
  className?: string;
}> = ({ size = 40, color = '#1890ff', className = '' }) => {
  return (
    <motion.div
      className={className}
      style={{ width: size, height: size }}
      animate={{ scale: [1, 1.2, 1], opacity: [0.5, 1, 0.5] }}
      transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
    >
      <div
        style={{
          width: '100%',
          height: '100%',
          borderRadius: '50%',
          backgroundColor: color
        }}
      />
    </motion.div>
  );
};

// 弹跳点加载器
export const BouncingDots: React.FC<{
  color?: string;
  className?: string;
}> = ({ color = '#1890ff', className = '' }) => {
  return (
    <div className={`flex space-x-2 ${className}`}>
      {[0, 1, 2].map((index) => (
        <motion.div
          key={index}
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            backgroundColor: color
          }}
          animate={{
            y: [0, -20, 0],
            scale: [1, 1.2, 1]
          }}
          transition={{
            duration: 0.6,
            delay: index * 0.2,
            repeat: Infinity,
            ease: "easeInOut"
          }}
        />
      ))}
    </div>
  );
};

// 波浪加载器
export const WaveLoader: React.FC<{
  color?: string;
  className?: string;
}> = ({ color = '#1890ff', className = '' }) => {
  return (
    <div className={`flex space-x-1 ${className}`}>
      {[0, 1, 2, 3, 4].map((index) => (
        <motion.div
          key={index}
          style={{
            width: 4,
            height: 20,
            backgroundColor: color,
            borderRadius: 2
          }}
          animate={{
            scaleY: [1, 2, 1]
          }}
          transition={{
            duration: 0.6,
            delay: index * 0.1,
            repeat: Infinity,
            ease: "easeInOut"
          }}
        />
      ))}
    </div>
  );
};

// 旋转方块加载器
export const RotatingSquares: React.FC<{
  size?: number;
  color?: string;
  className?: string;
}> = ({ size = 40, color = '#1890ff', className = '' }) => {
  return (
    <div className={`relative ${className}`} style={{ width: size, height: size }}>
      {[0, 1, 2, 3].map((index) => (
        <motion.div
          key={index}
          style={{
            position: 'absolute',
            width: size / 2,
            height: size / 2,
            backgroundColor: color,
            opacity: 0.7
          }}
          animate={{
            rotate: [0, 90, 180, 270, 360],
            scale: [1, 0.8, 1, 0.8, 1]
          }}
          transition={{
            duration: 2,
            delay: index * 0.2,
            repeat: Infinity,
            ease: "easeInOut"
          }}
        />
      ))}
    </div>
  );
};

// 进度条加载器
export const ProgressLoader: React.FC<{
  progress?: number;
  color?: string;
  className?: string;
  showPercentage?: boolean;
}> = ({ progress = 0, color = '#1890ff', className = '', showPercentage = false }) => {
  return (
    <div className={`w-full ${className}`}>
      <div
        style={{
          width: '100%',
          height: 4,
          backgroundColor: '#f0f0f0',
          borderRadius: 2,
          overflow: 'hidden'
        }}
      >
        <motion.div
          style={{
            height: '100%',
            backgroundColor: color,
            borderRadius: 2
          }}
          initial={{ width: 0 }}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.5, ease: "easeOut" }}
        />
      </div>
      {showPercentage && (
        <motion.div
          className="text-sm text-gray-600 mt-1"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
        >
          {Math.round(progress)}%
        </motion.div>
      )}
    </div>
  );
};

// 骨架屏加载器
export const SkeletonLoader: React.FC<{
  width?: string | number;
  height?: string | number;
  className?: string;
  rounded?: boolean;
}> = ({ width = '100%', height = 20, className = '', rounded = false }) => {
  return (
    <motion.div
      className={className}
      style={{
        width,
        height,
        borderRadius: rounded ? '50%' : 4,
        backgroundColor: '#f0f0f0'
      }}
      animate={{
        opacity: [0.5, 1, 0.5]
      }}
      transition={{
        duration: 1.5,
        repeat: Infinity,
        ease: "easeInOut"
      }}
    />
  );
};

// 卡片骨架屏
export const CardSkeleton: React.FC<{
  className?: string;
}> = ({ className = '' }) => {
  return (
    <div className={`p-4 border rounded-lg ${className}`}>
      <SkeletonLoader width="60%" height={20} className="mb-3" />
      <SkeletonLoader width="100%" height={16} className="mb-2" />
      <SkeletonLoader width="80%" height={16} className="mb-3" />
      <div className="flex space-x-2">
        <SkeletonLoader width={60} height={24} rounded />
        <SkeletonLoader width={80} height={24} rounded />
      </div>
    </div>
  );
};

// 表格骨架屏
export const TableSkeleton: React.FC<{
  rows?: number;
  columns?: number;
  className?: string;
}> = ({ rows = 5, columns = 4, className = '' }) => {
  return (
    <div className={className}>
      <div className="grid gap-4">
        {Array.from({ length: rows }).map((_, rowIndex) => (
          <div key={rowIndex} className="flex space-x-4">
            {Array.from({ length: columns }).map((_, colIndex) => (
              <SkeletonLoader
                key={colIndex}
                width="100%"
                height={16}
                className="flex-1"
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
};
