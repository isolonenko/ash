import { Sun, Moon } from 'lucide-react'
import { useTheme } from '@/hooks/useTheme'
import styles from './ThemeToggle.module.sass'

interface ThemeToggleProps {
  className?: string
}

export const ThemeToggle = ({ className }: ThemeToggleProps) => {
  const { theme, toggleTheme } = useTheme()

  return (
    <button
      className={`${styles.toggle} ${className ?? ''}`}
      onClick={toggleTheme}
      aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
      type="button"
    >
      {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  )
}
