import { useEffect, useState } from 'react';
import { Player } from './Player';
import { host, useEditor } from './store';
export function DetachedPlayer() {
  const session = useEditor((s) => s.session),
    theme = useEditor((s) => s.theme),
    [error, setError] = useState('');
  useEffect(() => {
    void host('playerBoot', null)
      .then(useEditor.getState().setSession)
      .catch((e) => setError(e.message));
    return window.elsewhen.onSession((s) => useEditor.getState().setSession(s));
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);
  if (error) return <div className="fatal-error">{error}</div>;
  return (
    <div className="detached-player">
      {session ? (
        <Player
          session={session}
          gameView
          onGameView={() => {}}
          onSettings={() => {}}
          nativePlayer
        />
      ) : (
        <p>Loading Game Player…</p>
      )}
    </div>
  );
}
