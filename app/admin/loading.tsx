export default function AdminLoading() {
  return (
    <div className="space-y-4" aria-label="Loading admin content" aria-busy="true">
      <div className="h-36 animate-pulse rounded-2xl bg-white/70" />
      <div className="grid grid-cols-2 gap-3">
        {[0, 1, 2, 3].map(item => <div key={item} className="h-32 animate-pulse rounded-2xl bg-white/70" />)}
      </div>
      <div className="h-64 animate-pulse rounded-2xl bg-white/70" />
    </div>
  );
}
