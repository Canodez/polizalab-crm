'use client';

interface AvatarProps {
  email: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

/**
 * Avatar component
 * Displays a circular avatar with the first letter of the user's email
 * 
 * @param email - User's email address
 * @param size - Size of the avatar (sm: 32px, md: 40px, lg: 120px)
 * @param className - Additional CSS classes
 */
export default function Avatar({ email, size = 'md', className = '' }: AvatarProps) {
  // Extract first letter of email and convert to uppercase
  const initial = email?.charAt(0).toUpperCase() || 'U';

  // Size classes mapping
  const sizeClasses = {
    sm: 'w-8 h-8 text-sm',
    md: 'w-10 h-10 text-sm',
    lg: 'w-30 h-30 text-4xl',
  };

  return (
    <div
      className={`
        inline-flex items-center justify-center rounded-full 
        bg-blue-600 text-white font-medium
        hover:bg-blue-700 transition-colors
        ${sizeClasses[size]}
        ${className}
      `.trim()}
    >
      {initial}
    </div>
  );
}
