'use client';

interface AvatarProps {
  email: string;
  imageUrl?: string | null;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

/**
 * Avatar component
 * Displays a circular avatar with the user's profile image or first letter of email
 * 
 * @param email - User's email address
 * @param imageUrl - Optional profile image URL
 * @param size - Size of the avatar (sm: 32px, md: 40px, lg: 120px)
 * @param className - Additional CSS classes
 */
export default function Avatar({ email, imageUrl, size = 'md', className = '' }: AvatarProps) {
  // Extract first letter of email and convert to uppercase
  const initial = email?.charAt(0).toUpperCase() || 'U';

  // Size classes mapping
  const sizeClasses = {
    sm: 'w-8 h-8 text-sm',
    md: 'w-10 h-10 text-sm',
    lg: 'w-30 h-30 text-5xl',
  };

  // If image URL is provided, display the image
  if (imageUrl) {
    return (
      <div
        className={`
          inline-flex items-center justify-center rounded-full 
          overflow-hidden bg-zinc-200
          hover:opacity-90 transition-opacity
          ${sizeClasses[size]}
          ${className}
        `.trim()}
      >
        <img
          src={imageUrl}
          alt={`Avatar de ${email}`}
          className="h-full w-full object-cover"
        />
      </div>
    );
  }

  // Otherwise, display initial
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
