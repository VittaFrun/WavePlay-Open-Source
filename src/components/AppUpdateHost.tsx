import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { router, usePathname } from 'expo-router';
import { AppAlert } from '../services/appAlert';
import { checkAppUpdate, dismissAppUpdate, getAppUpdate, shouldNotifyUpdate, subscribeAppUpdate } from '../services/appUpdates';

/** Daily network check; availability notifications also react to manual checks. */
export function AppUpdateHost() {
  const pathname = usePathname(), path = useRef(pathname);
  useEffect(() => { path.current = pathname; }, [pathname]);
  const notify = useRef<(() => void) | null>(null);
  useEffect(() => {
    let alive = true, checking = false, retry = false;
    const shown = new Set<number>();
    const show = async () => {
      if (!alive) return;
      if (checking) { retry = true; return; }
      if (AppState.currentState !== 'active' || ['/updates', '/welcome', '/auth/callback'].includes(path.current)) return;
      const snapshot = getAppUpdate();
      if (snapshot.status !== 'available' || !snapshot.release || shown.has(snapshot.release.versionCode)) return;
      checking = true;
      try {
        if (!await shouldNotifyUpdate()) return;
        const current = getAppUpdate();
        if (!alive || AppState.currentState !== 'active' || current.status !== 'available' || current.release?.versionCode !== snapshot.release.versionCode || ['/updates', '/welcome', '/auth/callback'].includes(path.current)) return;
        const release = snapshot.release;
        shown.add(release.versionCode);
        AppAlert.alert('WavePlay tiene una nueva versión', `Ya puedes instalar la versión ${release.versionName}.${release.notes ? '\n\n' + release.notes.slice(0, 600) : ''}`, [
          {text: 'Más tarde', style: 'cancel', onPress: () => { void dismissAppUpdate(release.versionCode).catch(() => {}); }},
          {text: 'Ver actualización', onPress: () => router.push('/updates')},
        ], undefined, 'update');
      } finally {
        checking = false;
        if (retry && alive) { retry = false; void show().catch(() => {}); }
      }
    };
    notify.current = () => { void show().catch(() => {}); };
    const check = async () => {
      if (AppState.currentState !== 'active') return;
      await checkAppUpdate(true);
      await show();
    };
    const unsubscribe = subscribeAppUpdate(() => { void show().catch(() => {}); });
    const timer = setTimeout(() => { void check().catch(() => {}); }, 15000);
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') void check().catch(() => {});
    });
    return () => { alive = false; notify.current = null; clearTimeout(timer); subscription.remove(); unsubscribe(); };
  }, []);
  useEffect(() => { notify.current?.(); }, [pathname]);
  return null;
}
