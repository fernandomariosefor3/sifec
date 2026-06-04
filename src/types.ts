export type RoleType = 'admin' | 'gestor' | 'tecnico' | 'none';

export interface ProjectFile {
  name: string;
  path: string;
  language: string;
  content: string;
  description: string;
}

export interface Recommendation {
  id: string;
  title: string;
  category: 'architecture' | 'performance' | 'security' | 'firebase' | 'supabase';
  severity: 'high' | 'medium' | 'low';
  summary: string;
  diagnostic: string;
  solution: string;
  codeSuggestion?: string;
  codeLang?: string;
}

export interface PerformanceMetric {
  name: string;
  before: number;
  after: number;
}
