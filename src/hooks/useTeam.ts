import { useState, useEffect } from 'react';
import { TeamMember } from '../types';

/**
 * Loads the public team list. There is no built-in fallback list: the server is the
 * only source, so hidden or removed people never flash on screen.
 */
export function useTeam() {
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const reload = async () => {
    try {
      const res = await fetch('/api/team');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setTeam(Array.isArray(data) ? data : []);
      setError(false);
    } catch (err) {
      console.warn('[useTeam] Error loading team:', err);
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    reload();
  }, []);

  return { team, loading, error, reload };
}
