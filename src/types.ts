export type Role = 'builder' | 'business' | 'design' | 'other';

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
  role: Role;
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
  whatsapp?: string;
  avatar?: string;
  status?: string;
  is_demo?: boolean;
  created_at: string;
  gh?: GitHubData | null;
}

export interface MatchResult {
  id: string;
  score: number;
  reason: string;
  spark?: string;
  icebreaker?: string;
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
