export default function AdminLoading() {
  return (
    <div className="flex min-h-[calc(100vh-64px)] items-center justify-center">
      <div className="animate-pulse">
        <div className="space-y-4">
          {/* Skeleton header */}
          <div className="h-8 w-48 bg-gray-200 rounded"></div>
          
          {/* Skeleton content */}
          <div className="space-y-3">
            <div className="h-4 w-64 bg-gray-200 rounded"></div>
            <div className="h-4 w-48 bg-gray-200 rounded"></div>
            <div className="h-4 w-56 bg-gray-200 rounded"></div>
            <div className="h-4 w-32 bg-gray-200 rounded"></div>
          </div>
          
          {/* Skeleton grid */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3, 4, 5, 6].map((_, i) => (
              <div key={i} className="aspect-square bg-gray-200 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}