import { useState, useEffect } from 'react';
import { TeamMember } from '../types';
import { fetchTeam } from '../services/api';

export const DEFAULT_TEAM_MEMBERS: TeamMember[] = [
  {
    id: 'team-saifuddin',
    name: 'Saifuddin Ahmed',
    title: 'Team lead and engineering',
    line1: 'Software and AI Engineer • Systems Architect',
    line2: 'Future Stars Center for Development and Capacity Building',
    github: 'Saifuddin2Ahmed',
    linkedin: null,
    linked_profile_id: null,
    photo: null,
    order: 0,
    hidden: false
  },
  {
    id: 'team-abubaker',
    name: 'Abubaker Mohamed Adam',
    title: 'Community and NGO partnerships',
    line1: 'NGO volunteer',
    line2: 'Sub-Saharan College',
    github: 'abubakermohammed092077-bit',
    linkedin: null,
    linked_profile_id: null,
    photo: null,
    order: 1,
    hidden: false
  },
  {
    id: 'team-adinan',
    name: 'Adinan Juuko',
    title: 'Testing and quality',
    line1: 'Software Engineering',
    line2: 'Victoria University',
    github: 'Aditech-191',
    linkedin: null,
    linked_profile_id: null,
    photo: null,
    order: 2,
    hidden: false
  },
  {
    id: 'team-amme',
    name: 'Amme Patience Esther',
    title: 'Marketing and communications',
    line1: 'Bachelor of Marketing',
    line2: 'Makerere University Business School',
    github: null,
    linkedin: null,
    linked_profile_id: null,
    photo: null,
    order: 3,
    hidden: false
  },
  {
    id: 'team-mupole',
    name: 'Mupole Uwizeye Alexis',
    title: 'Product and data',
    line1: 'Business Computing',
    line2: 'Bugema University',
    github: 'Alexis-Mupole',
    linkedin: null,
    linked_profile_id: null,
    photo: null,
    order: 4,
    hidden: false
  },
  {
    id: 'team-nabagulanyi',
    name: 'Nabagulanyi Prossy Sherry',
    title: 'User research and outreach',
    line1: 'Student',
    line2: 'Makerere University Business School',
    github: null,
    linkedin: null,
    linked_profile_id: null,
    photo: null,
    order: 5,
    hidden: false
  },
  {
    id: 'team-ojambo',
    name: 'Ojambo Emmanuel',
    title: 'Business model and sustainability',
    line1: 'Accounting',
    line2: 'Makerere University Business School',
    github: null,
    linkedin: null,
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
