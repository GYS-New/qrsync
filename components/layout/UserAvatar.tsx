import { getInitials } from '@/lib/utils'

interface UserAvatarProps {
  name: string
  photoUrl?: string
  size?: number
  className?: string
}

const COLORS = [
  ['#2e8b2e', '#1f6b1f'],
  ['#2563eb', '#1d4ed8'],
  ['#6d28d9', '#5b21b6'],
  ['#c2610c', '#9a4e0a'],
  ['#0d9488', '#0f766e'],
]

function getColor(name: string) {
  const idx = name.charCodeAt(0) % COLORS.length
  return COLORS[idx]
}

export default function UserAvatar({ name, photoUrl, size = 32, className = '' }: UserAvatarProps) {
  const [from, to] = getColor(name)
  const initials = getInitials(name)
  const fontSize = Math.floor(size * 0.36)

  if (photoUrl) {
    return (
      <img
        src={photoUrl}
        alt={name}
        className={className}
        style={{
          width: size, height: size,
          borderRadius: '50%',
          objectFit: 'cover',
          flexShrink: 0,
        }}
      />
    )
  }

  return (
    <div
      className={className}
      title={name}
      style={{
        width: size, height: size,
        borderRadius: '50%',
        background: `linear-gradient(135deg, ${from}, ${to})`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: 'white',
        fontSize,
        fontWeight: 700,
        flexShrink: 0,
        userSelect: 'none',
      }}
    >
      {initials}
    </div>
  )
}
