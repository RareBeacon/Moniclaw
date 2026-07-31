export default function DashboardLoading() {
  return (
    <div className="mx-auto max-w-5xl animate-pulse">
      <div className="h-8 w-56 rounded-lg bg-secondary" />
      <div className="mt-2 h-4 w-40 rounded bg-secondary/70" />
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-28 rounded-xl border bg-card" />
        ))}
      </div>
      <div className="mt-8 h-64 rounded-xl border bg-card" />
    </div>
  );
}
