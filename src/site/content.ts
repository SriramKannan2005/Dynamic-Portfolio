/** Typed access to data/*.json (edit the JSON, not this file). */
import contentJson from '../../data/content.json';
import projectsJson from '../../data/projects.json';

export interface Metric { value: number; suffix?: string; decimals?: number; label?: string }
export interface Achievement { id: string; kind: string; level?: string; title: string; detail?: string; metric?: Metric; icon?: string; link?: string }
export interface Experience { role: string; org: string; period: string; type: string; summary?: string; points?: string[]; tags?: string[] }
export interface SkillGroup { id: string; name: string; items: string[] }
export interface Stat { id: string; label: string; source: string; filter?: Record<string, string>; achievement?: string; format?: string }
export interface Resume { id: string; label: string; description?: string; file: string; filename?: string; updated?: string }
export interface Content {
  profile: { name: string; title: string; roles: string[]; location: string; email: string; links: Record<string, string> };
  about: string[];
  stats: Stat[];
  skills: SkillGroup[];
  experience: Experience[];
  achievements: Achievement[];
  certifications: { title: string; issuer: string; image: string }[];
  education: { degree: string; school: string; note?: string; period: string; score?: string }[];
  resumes: Resume[];
}
export interface CaseStudy { problem: string; pipeline: { title: string; detail: string }[]; results: (Metric & { label: string })[] }
export interface Project {
  id: string;
  title: string; hook?: string; description?: string; techStack?: string[];
  github?: string; video?: string; image?: string; category: string;
  featured?: boolean; order?: number; badge?: string;
  poster?: { hueA: number; hueB: number; shape: string };
  links?: { github?: string; demo?: string };
  caseStudy?: CaseStudy;
}

export const content = contentJson as unknown as Content;
export const projects: Project[] = Object.entries(projectsJson as Record<string, Omit<Project, 'id'>>)
  .map(([id, p]) => ({ id, ...p }))
  .sort((a, b) => (a.order ?? 99) - (b.order ?? 99));

export const CAT_LABEL: Record<string, string> = { ai: 'AI', ml: 'ML', web: 'Web' };

export function linksOf(p: Project) {
  return { github: p.links?.github ?? p.github, demo: p.links?.demo };
}

/** Stats are computed from the data, never typed in. */
export function computeStat(stat: Stat): { value: number; suffix: string; decimals: number } | null {
  const matches = (o: object, f?: Record<string, string>) => Object.entries(f ?? {}).every(([k, v]) => (o as Record<string, unknown>)[k] === v);
  switch (stat.source) {
    case 'projects': {
      const n = projects.length;
      if (stat.format === 'roundedPlus' && n >= 10) { const f = Math.floor(n / 5) * 5; return { value: f, suffix: n > f ? '+' : '', decimals: 0 }; }
      return { value: n, suffix: '', decimals: 0 };
    }
    case 'experience': return { value: content.experience.filter((e) => matches(e, stat.filter)).length, suffix: '', decimals: 0 };
    case 'achievements': return { value: content.achievements.filter((a) => matches(a, stat.filter)).length, suffix: '', decimals: 0 };
    case 'achievementMetric': {
      const a = content.achievements.find((x) => x.id === stat.achievement);
      return a?.metric ? { value: a.metric.value, suffix: a.metric.suffix ?? '', decimals: a.metric.decimals ?? 0 } : null;
    }
    default: return null;
  }
}
export const fmt = (v: number, d = 0) => (d ? v.toFixed(d) : String(Math.round(v)));
