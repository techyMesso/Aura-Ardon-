export default function StorefrontLoading() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-6 md:px-6 md:py-10 lg:px-10" aria-busy="true" aria-label="Loading collection">
      <div className="h-40 animate-pulse rounded-[1.75rem] bg-champagne/35" />
      <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map(item => <div key={item} className="aspect-[4/5] animate-pulse rounded-[1.5rem] bg-white/75" />)}
      </div>
    </div>
  );
}
