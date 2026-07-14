import { Moon, Sun } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useThemeStore } from '@/stores/theme-store'

export function ThemeToggle() {
  const { theme, toggle } = useThemeStore()
  return (
    <Button variant="ghost" size="icon" onClick={toggle} aria-label="Toggle dark mode">
      {theme === 'dark' ? <Sun className="size-4.5" /> : <Moon className="size-4.5" />}
    </Button>
  )
}
