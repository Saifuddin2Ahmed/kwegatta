export type Role =
  | 'Founder'
  | 'Business'
  | 'Developer'
  | 'Designer'
  | 'Researcher'
  | 'Domain expert'
  | 'Mentor'
  | 'Student'
  | 'builder'
  | 'design'
  | 'other';

export interface GitHubRepo {
  name: string;
  desc?: string;
  lang?: string;
  stars?: number;
  url?: string;
}

export interface GitHubData {
  login: string;
  repos?: number;
  langs?: string[];
  top?: GitHubRepo[];
  notfound?: boolean;
}

export interface Profile {
  id: string;
  name: string;
  role: Role | string;
  roles?: string[];
  intent?: string;
  intents?: string[];
  stage?: string;
  location?: string;
  hours_per_week?: string;
  headline: string;
  bio: string;
  offers: string;
  needs: string;
  teaches?: string;
  learns?: string;
  tags: string[];
  skills: string[];
  github?: string;
  linkedin?: string;
  website?: string;
  facebook?: string;
  tiktok?: string;
  twitter?: string;
  instagram?: string;
  youtube?: string;
  scholar?: string;
  orcid?: string;
  research_area?: string;
  institution?: string;
  whatsapp?: string;
  hide_whatsapp?: boolean;
  has_whatsapp?: boolean;
  avatar?: string;
  status?: string;
  is_demo?: boolean;
  created_at: string;
  gh?: GitHubData | null;
  blocked_ids?: string[];
  hidden?: boolean;
  suspended?: boolean;
  is_organiser?: boolean;
  account_uid?: string;
  email?: string;
}

export interface AskKwegattaMatch {
  profile_id: string;
  profile?: Profile;
  reason: string;
}

export interface ReportItem {
  id: string;
  reporter_id: string;
  reporter_name: string;
  reported_id: string;
  reported_name: string;
  reason: string;
  details?: string;
  created_at: string;
  status?: 'pending' | 'resolved' | 'dismissed';
}

export interface MatchResult {
  id: string;
  score: number;
  reason: string;
  spark?: string;
  icebreaker?: string;
  matchType?: 'quick' | 'ai';
}

export interface LearnMatchResult {
  mentor?: {
    profile: Profile;
    reason: string;
  };
  studyPartner?: {
    profile: Profile;
    reason: string;
  };
}

export interface Follow {
  id: string;
  follower_id: string;
  following_id: string;
  created_at: string;
}

export interface NotificationItem {
  id: string;
  to_id: string;
  from_id?: string | null;
  type: 'match' | 'follow' | 'connect' | 'welcome' | 'digest';
  body: string;
  read: boolean;
  created_at: string;
}

export interface PostComment {
  id: string;
  author_id: string;
  author_name: string;
  body: string;
  created_at: string;
}

export interface Post {
  id: string;
  author_id: string;
  body: string;
  title?: string;
  kind: 'idea' | 'need' | 'offer' | 'question';
  tags: string[];
  created_at: string;
  reactions?: Record<string, number>;
  comments?: PostComment[];
}

export type OpportunityType = 'Grant' | 'Hackathon' | 'Job' | 'Training' | 'Call for partners';

export type EventStatus = 'pending' | 'published' | 'rejected';

export interface EventOpportunityItem {
  id: string;
  kind: 'event' | 'opportunity';
  title: string;
  description: string;
  // For Event:
  datetime?: string; // date and time
  location?: string; // place or online link
  cover_image?: string; // optional cover image
  registration_link?: string; // optional registration link
  // For Opportunity:
  opportunity_type?: OpportunityType;
  deadline?: string;
  link?: string;
  // Attendees / RSVPs:
  created_at: string;
  created_by?: string;
  author_id?: string;
  author_name?: string;
  author_is_organiser?: boolean;
  status?: EventStatus;
  rejection_reason?: string;
  approved_by?: string;
  approved_at?: string;
  last_update_sent_at?: string;
  published: boolean;
  attendee_ids: string[];
}

export interface PinnedAnnouncement {
  id: string;
  text: string;
  link?: string;
  active: boolean;
  created_at: string;
  created_by?: string;
}

export interface EventAttendeeMatch {
  profile: Profile;
  reason: string;
  score: number;
}
