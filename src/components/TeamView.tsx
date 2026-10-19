import React from 'react';
import { useTeam } from '../hooks/useTeam';
import { HEADER_IMAGES } from '../lib/headerImages';
import { PageHeader } from './PageHeader';
import { TeamGrid } from './TeamGrid';

/** Public Team page (#/team). Same cards as the About page. */
export const TeamView: React.FC = () => {
  const { team, loading } = useTeam();
  return (
    <div className="space-y-8 sm:space-y-10">
      <PageHeader
        title="The team"
        subtitle="The people building this platform."
        image={HEADER_IMAGES.team}
        breadcrumb={[{ label: 'About', href: '#/about' }, { label: 'Team' }]}
      />
      <TeamGrid team={team} loading={loading} />
    </div>
  );
};
