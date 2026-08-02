import { useEffect } from 'react';
import { useAuth } from './AuthContext.jsx';

// Applies the `dark` class Tailwind's class-based dark: variant looks for
// (see @custom-variant in globals.css). Priority: the logged-in user's saved
// theme preference (fixes the previously-dead Profile theme selector) ->
// system preference for logged-out pages (login/register/forgot-password).
export function ThemeEffect() {
  const auth = useAuth();
  const theme = auth?.user?.theme;

  useEffect(() => {
    const root = document.documentElement;
    let isDark;
    if (theme === 'light') isDark = false;
    else if (theme === 'dark') isDark = true;
    else isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    root.classList.toggle('dark', isDark);
  }, [theme]);

  return null;
}
