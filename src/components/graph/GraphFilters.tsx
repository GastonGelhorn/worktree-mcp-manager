import { Search, Filter, X } from 'lucide-react';

interface GraphFiltersProps {
  authorFilter: string;
  branchFilter: string;
  onAuthorChange: (v: string) => void;
  onBranchChange: (v: string) => void;
}

export function GraphFilters({
  authorFilter,
  branchFilter,
  onAuthorChange,
  onBranchChange,
}: GraphFiltersProps) {
  const hasFilters = authorFilter || branchFilter;

  return (
    <div className="flex items-center gap-2">
      <Filter className="w-3.5 h-3.5 text-white/30" />

      <div className="relative">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-white/20" />
        <input
          type="text"
          placeholder="Author..."
          value={authorFilter}
          onChange={e => onAuthorChange(e.target.value)}
          className="pl-6 pr-2 py-1 w-32 text-[11px] bg-white/5 border border-white/5 rounded-md text-white/70 placeholder:text-white/20 focus:outline-none focus:border-white/15 transition-colors"
        />
      </div>

      <div className="relative">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-white/20" />
        <input
          type="text"
          placeholder="Branch..."
          value={branchFilter}
          onChange={e => onBranchChange(e.target.value)}
          className="pl-6 pr-2 py-1 w-32 text-[11px] bg-white/5 border border-white/5 rounded-md text-white/70 placeholder:text-white/20 focus:outline-none focus:border-white/15 transition-colors"
        />
      </div>

      {hasFilters && (
        <button
          onClick={() => { onAuthorChange(''); onBranchChange(''); }}
          className="p-1 rounded-md hover:bg-white/5 text-white/30 hover:text-white/60 transition-colors"
          title="Clear filters"
        >
          <X className="w-3 h-3" />
        </button>
      )}
    </div>
  );
}
