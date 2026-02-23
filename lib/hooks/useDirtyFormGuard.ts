import { useState, useEffect, useCallback } from 'react';
import { AppRouterInstance } from 'next/dist/shared/lib/app-router-context.shared-runtime';

export function useDirtyFormGuard() {
  const [isDirty, setIsDirty] = useState(false);

  const markDirty = useCallback(() => setIsDirty(true), []);
  const markClean = useCallback(() => setIsDirty(false), []);

  // Warn before browser close/reload when there are unsaved changes
  useEffect(() => {
    if (!isDirty) return;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty]);

  /**
   * Navigate with a dirty-state guard.
   * If the form is dirty, shows a native confirm dialog before navigating.
   */
  const guardedNavigate = useCallback(
    (href: string, router: AppRouterInstance) => {
      if (!isDirty) {
        router.push(href);
        return;
      }

      const confirmed = window.confirm(
        '¿Tienes cambios sin guardar. ¿Descartar?'
      );
      if (confirmed) {
        setIsDirty(false);
        router.push(href);
      }
    },
    [isDirty]
  );

  return { isDirty, markDirty, markClean, guardedNavigate };
}
