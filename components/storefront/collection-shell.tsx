import type { Category } from "@/lib/types";

interface CollectionShellProps {
  categories: Category[];
  activeCategory?: Category;
  children: React.ReactNode;
}

export function CollectionShell({
  activeCategory,
  children
}: CollectionShellProps) {
  return (
    <div className="min-h-dvh bg-paper text-text">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-10 lg:py-12">
        <header className="mb-8 border-b border-text/12 pb-6">
          <h1 className="font-serif text-[40px] font-normal leading-[1.0] tracking-[-0.01em] text-text md:text-[64px]">
            {activeCategory?.name ?? "Shop"}
          </h1>
          {activeCategory?.description ? (
            <p className="mt-3 max-w-xl font-sans text-[16px] leading-[1.5] text-muted">
              {activeCategory.description}
            </p>
          ) : null}
        </header>

        {children}
      </div>
    </div>
  );
}
