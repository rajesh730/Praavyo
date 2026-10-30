export default function Loading() {
  return (
    <main className="px-4 py-8 sm:py-7">
      <div className="mx-auto max-w-5xl">
        {/* Header */}
        <div className="skeleton h-10 w-64 rounded-control" />
        <div className="skeleton mt-4 h-4 w-full max-w-xl rounded-control" />

        {/* Stat row */}
        <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="card p-5">
              <div className="flex items-center justify-between gap-3">
                <div className="skeleton h-3 w-20 rounded-control" />
                <div className="skeleton h-9 w-9 rounded-control" />
              </div>
              <div className="skeleton mt-4 h-7 w-16 rounded-control" />
            </div>
          ))}
        </div>

        {/* Card grid */}
        <div className="mt-5 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((card) => (
            <div key={card} className="card p-5">
              <div className="flex items-center gap-3">
                <div className="skeleton h-11 w-11 rounded-control" />
                <div className="flex-1 space-y-2">
                  <div className="skeleton h-3.5 w-3/4 rounded-control" />
                  <div className="skeleton h-3 w-1/2 rounded-control" />
                </div>
              </div>
              <div className="mt-5 space-y-2.5">
                <div className="skeleton h-3 w-full rounded-control" />
                <div className="skeleton h-3 w-5/6 rounded-control" />
                <div className="skeleton h-3 w-2/3 rounded-control" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
