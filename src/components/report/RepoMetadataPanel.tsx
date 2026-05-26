import { Calendar, GitCommit, Users, Star, Activity, AlertCircle } from 'lucide-react';
import type { GitHubStats, PackageStats } from '../../types/analysis';

interface Props {
  github?: GitHubStats;
  packageStats?: PackageStats;
}

export function RepoMetadataPanel({ github, packageStats }: Props) {
  if (!github) return null;

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
      <div className="flex items-center space-x-3 mb-6 pb-4 border-b border-zinc-800">
        {github.owner?.avatarUrl ? (
          <img src={github.owner.avatarUrl} alt="Author avatar" className="w-10 h-10 rounded-lg bg-zinc-800 border border-zinc-700" />
        ) : (
          <div className="w-10 h-10 rounded-lg bg-zinc-800 flex items-center justify-center border border-zinc-700">
            <Users className="w-5 h-5 text-zinc-500" />
          </div>
        )}
        <div>
          <h3 className="text-zinc-100 font-semibold text-lg leading-tight">
            {github.owner?.login || 'Unknown Author'}
          </h3>
          <span className="text-xs text-zinc-500 font-mono">
            {github.owner?.type || 'Author'}
          </span>
          {packageStats?.description && (
            <p className="text-xs text-zinc-400 mt-1 max-w-lg">{packageStats.description}</p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Creation Date */}
        <div className="bg-zinc-950/50 rounded-lg p-4 border border-zinc-800/50">
          <div className="flex items-center space-x-2 text-zinc-400 mb-2">
            <Calendar className="w-4 h-4" />
            <span className="text-xs font-semibold uppercase tracking-wider">Created</span>
          </div>
          <div className="text-zinc-100 font-medium">
            {github.createdAt ? new Date(github.createdAt).toLocaleDateString() : 'Unknown'}
          </div>
        </div>

        {/* Last Updated */}
        <div className="bg-zinc-950/50 rounded-lg p-4 border border-zinc-800/50">
          <div className="flex items-center space-x-2 text-zinc-400 mb-2">
            <GitCommit className="w-4 h-4" />
            <span className="text-xs font-semibold uppercase tracking-wider">Last Update</span>
          </div>
          <div className="text-zinc-100 font-medium">
            {github.lastCommitDate ? new Date(github.lastCommitDate).toLocaleDateString() : 'Unknown'}
          </div>
        </div>

        {/* Popularity / Stars */}
        <div className="bg-zinc-950/50 rounded-lg p-4 border border-zinc-800/50">
          <div className="flex items-center space-x-2 text-zinc-400 mb-2">
            <Star className="w-4 h-4 text-yellow-500/80" />
            <span className="text-xs font-semibold uppercase tracking-wider">Stars</span>
          </div>
          <div className="text-zinc-100 font-medium">
            {github.stars?.toLocaleString() || 0}
          </div>
        </div>

        {/* Open Issues */}
        <div className="bg-zinc-950/50 rounded-lg p-4 border border-zinc-800/50">
          <div className="flex items-center space-x-2 text-zinc-400 mb-2">
            <AlertCircle className="w-4 h-4" />
            <span className="text-xs font-semibold uppercase tracking-wider">Open Issues</span>
          </div>
          <div className="text-zinc-100 font-medium">
            {github.openIssues?.toLocaleString() || 0}
          </div>
        </div>
      </div>
      
      <div className="mt-4 pt-4 border-t border-zinc-800/50 flex flex-col md:flex-row md:items-center justify-between text-xs text-zinc-500 gap-2">
        <div className="flex items-center space-x-4">
          <span className="flex items-center space-x-1.5">
            <Activity className="w-3.5 h-3.5" />
            <span>Forks: {github.forks?.toLocaleString() || 0}</span>
          </span>
          {github.archived && (
            <span className="bg-red-950/30 text-red-400 px-2 py-0.5 rounded border border-red-900/50">
              Archived / Read-only
            </span>
          )}
        </div>
        <div>
          <a href={github.url} target="_blank" rel="noreferrer" className="text-indigo-400 hover:text-indigo-300">
            View on GitHub →
          </a>
        </div>
      </div>
    </div>
  );
}
