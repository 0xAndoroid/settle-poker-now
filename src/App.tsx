import { useCallback, useRef, useState } from 'react';
import { Masthead, type TickerItem } from './components/Masthead';
import { EphemeralView } from './components/EphemeralView';
import { LiveGameView } from './components/LiveGameView';
import { PersistentGameView } from './components/PersistentGameView';
import { ToastViewport } from './components/Toast';
import { useToast } from './hooks/useToast';
import { useTheme } from './hooks/useTheme';
import { useRoute } from './hooks/useRoute';
import { navigate } from './lib/routing';

export default function App() {
  const { theme, toggle: toggleTheme } = useTheme();
  const route = useRoute();
  const { toasts, push: pushToast, dismiss: dismissToast } = useToast();

  const [ticker, setTicker] = useState<TickerItem[] | undefined>(undefined);
  const ephemeralResetRef = useRef<(() => void) | null>(null);

  const handleReset = useCallback(() => {
    if (route.kind === 'game' || route.kind === 'live') {
      navigate('/');
      setTicker(undefined);
      return;
    }
    ephemeralResetRef.current?.();
    setTicker(undefined);
  }, [route.kind]);

  const showHeader =
    route.kind === 'game' || route.kind === 'live' || ticker !== undefined;

  return (
    <div className="min-h-full">
      <Masthead
        theme={theme}
        onThemeToggle={toggleTheme}
        onReset={handleReset}
        showReset={showHeader}
        ticker={ticker}
      />

      {route.kind === 'home' && (
        <EphemeralView
          onTickerChange={setTicker}
          onResetRequest={handleReset}
          registerReset={(reset) => {
            ephemeralResetRef.current = reset;
          }}
          pushToast={pushToast}
        />
      )}

      {route.kind === 'game' && (
        <PersistentGameView
          gameId={route.id}
          onTickerChange={setTicker}
          pushToast={pushToast}
        />
      )}

      {route.kind === 'live' && (
        <LiveGameView
          gameId={route.id}
          onTickerChange={setTicker}
          pushToast={pushToast}
        />
      )}

      <ToastViewport toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
