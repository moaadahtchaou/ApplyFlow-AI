export function StatCard({ label, value, helper }: { label: string; value: number | string; helper?: string }) {
  return (
    <div className="metric-card">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-semibold leading-6 text-on-surface-variant">{label}</p>
        <span className="h-2 w-2 rounded-full bg-primary/70" />
      </div>
      <p className="mt-4 text-3xl font-black tracking-[-0.04em] text-primary">{value}</p>
      {helper ? <p className="mt-2 text-xs font-semibold leading-5 text-on-surface-variant">{helper}</p> : null}
    </div>
  );
}
