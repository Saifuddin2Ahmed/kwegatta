import { useState, useEffect } from 'react';
import { TeamMember } from '../types';
import { fetchTeam } from '../services/api';

export const DEFAULT_TEAM_MEMBERS: TeamMember[] = [
  {
    id: 'team-saifuddin',
    name: 'Saifuddin Ahmed',
    line2: 'Future Stars Center for Development and Capacity Building',
    github: 'Saifuddin2Ahmed',
    linked_profile_id: null,
    photo: null,
    order: 0,
    hidden: false
  },
  {
    id: 'team-abubaker',
    name: 'Abubaker Mohamed Adam',
    line2: 'Sub-Saharan College',
    github: 'abubakermohammed092077-bit',
    linked_profile_id: null,
    photo: null,
    order: 1,
    hidden: false
  },
  {
    id: 'team-adinan',
    name: 'Adinan Juuko',
    line2: 'Victoria University',
    github: 'Aditech-191',
    linked_profile_id: null,
    photo: null,
    order: 2,
    hidden: false
  },
  {
    id: 'team-amme',
    name: 'Amme Patience Esther',
    line2: 'Makerere University Business School',
    github: null,
    linked_profile_id: null,
    photo: null,
    order: 3,
    hidden: false
  },
  {
    id: 'team-mupole',
    name: 'Mupole Uwizeye Alexis',
    line2: 'Bugema University',
    github: 'Alexis-Mupole',
    linked_profile_id: null,
    photo: null,
    order: 4,
    hidden: false
  },
  {
    id: 'team-nabagulanyi',
    name: 'Nabagulanyi Prossy Sherry',
    line2: 'Makerere University Business School',
    github: null,
    linked_profile_id: null,
    photo: null,
    order: 5,
    hidden: false
  },
  {
    id: 'team-ojambo',
    name: 'Ojambo Emmanuel',
    line2: 'Makerere University Business School',
    github: null,
    linked_profile_id: null,
    photo: null,
    order: 6,
    hidden: false
  }
];

export function useTeam() {
  const [team, setTeam] = useState<TeamMember[]>(DEFAULT_TEAM_MEMBERS);
  const [loading, setLoading] = useState(true);

  const reload = async () => {
    try {
      const data = await fetchTeam();
      if (Array.isArray(data) && data.length > 0) {
        setTeam(data);
      }
    } catch (err) {
      console.warn('[useTeam] Error loading team:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    reload();
  }, []);

  return { team, loading, reload };
}
