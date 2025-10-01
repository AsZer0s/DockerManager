import React from 'react';
import { motion } from 'framer-motion';

// 打字机效果
export const TypewriterText: React.FC<{
  text: string;
  speed?: number;
  className?: string;
}> = ({ text, speed = 50, className = '' }) => {
  const [displayedText, setDisplayedText] = React.useState('');
  const [currentIndex, setCurrentIndex] = React.useState(0);

  React.useEffect(() => {
    if (currentIndex < text.length) {
      const timeout = setTimeout(() => {
        setDisplayedText(prev => prev + text[currentIndex]);
        setCurrentIndex(prev => prev + 1);
      }, speed);

      return () => clearTimeout(timeout);
    }
  }, [currentIndex, text, speed]);

  return (
    <span className={className}>
      {displayedText}
      <motion.span
        animate={{ opacity: [0, 1, 0] }}
        transition={{ duration: 0.8, repeat: Infinity }}
        className="inline-block w-0.5 h-5 bg-current ml-1"
      />
    </span>
  );
};

// 渐变文字效果
export const GradientText: React.FC<{
  text: string;
  className?: string;
  gradient?: string;
}> = ({ text, className = '', gradient = 'from-blue-500 to-purple-600' }) => {
  return (
    <motion.span
      className={`bg-gradient-to-r ${gradient} bg-clip-text text-transparent ${className}`}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: "easeOut" }}
    >
      {text}
    </motion.span>
  );
};

// 波浪文字效果
export const WaveText: React.FC<{
  text: string;
  className?: string;
  delay?: number;
}> = ({ text, className = '', delay = 0 }) => {
  const letters = text.split('');

  return (
    <span className={className}>
      {letters.map((letter, index) => (
        <motion.span
          key={index}
          initial={{ y: 0 }}
          animate={{ y: [0, -10, 0] }}
          transition={{
            duration: 0.6,
            delay: delay + index * 0.1,
            repeat: Infinity,
            repeatDelay: 2,
            ease: "easeInOut"
          }}
          className="inline-block"
        >
          {letter === ' ' ? '\u00A0' : letter}
        </motion.span>
      ))}
    </span>
  );
};

// 闪烁文字效果
export const BlinkText: React.FC<{
  text: string;
  className?: string;
  blinkSpeed?: number;
}> = ({ text, className = '', blinkSpeed = 1 }) => {
  return (
    <motion.span
      className={className}
      animate={{ opacity: [1, 0, 1] }}
      transition={{
        duration: blinkSpeed,
        repeat: Infinity,
        ease: "easeInOut"
      }}
    >
      {text}
    </motion.span>
  );
};

// 旋转文字效果
export const RotateText: React.FC<{
  text: string;
  className?: string;
  duration?: number;
}> = ({ text, className = '', duration = 2 }) => {
  return (
    <motion.span
      className={className}
      animate={{ rotate: [0, 360] }}
      transition={{
        duration: duration,
        repeat: Infinity,
        ease: "linear"
      }}
    >
      {text}
    </motion.span>
  );
};

// 弹跳文字效果
export const BounceText: React.FC<{
  text: string;
  className?: string;
  delay?: number;
}> = ({ text, className = '', delay = 0 }) => {
  const letters = text.split('');

  return (
    <span className={className}>
      {letters.map((letter, index) => (
        <motion.span
          key={index}
          initial={{ y: 0, scale: 1 }}
          animate={{ 
            y: [0, -20, 0],
            scale: [1, 1.2, 1]
          }}
          transition={{
            duration: 0.6,
            delay: delay + index * 0.1,
            repeat: Infinity,
            repeatDelay: 3,
            ease: "easeInOut"
          }}
          className="inline-block"
        >
          {letter === ' ' ? '\u00A0' : letter}
        </motion.span>
      ))}
    </span>
  );
};

// 淡入文字效果
export const FadeInText: React.FC<{
  text: string;
  className?: string;
  delay?: number;
  duration?: number;
}> = ({ text, className = '', delay = 0, duration = 0.6 }) => {
  return (
    <motion.span
      className={className}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration, delay, ease: "easeOut" }}
    >
      {text}
    </motion.span>
  );
};

// 滑动文字效果
export const SlideInText: React.FC<{
  text: string;
  className?: string;
  direction?: 'left' | 'right' | 'up' | 'down';
  delay?: number;
  duration?: number;
}> = ({ text, className = '', direction = 'left', delay = 0, duration = 0.6 }) => {
  const directionMap = {
    left: { x: -100, y: 0 },
    right: { x: 100, y: 0 },
    up: { x: 0, y: -100 },
    down: { x: 0, y: 100 }
  };

  return (
    <motion.span
      className={className}
      initial={{ opacity: 0, ...directionMap[direction] }}
      animate={{ opacity: 1, x: 0, y: 0 }}
      transition={{ duration, delay, ease: "easeOut" }}
    >
      {text}
    </motion.span>
  );
};

// 缩放文字效果
export const ScaleText: React.FC<{
  text: string;
  className?: string;
  delay?: number;
  duration?: number;
}> = ({ text, className = '', delay = 0, duration = 0.6 }) => {
  return (
    <motion.span
      className={className}
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ duration, delay, ease: "backOut" }}
    >
      {text}
    </motion.span>
  );
};
