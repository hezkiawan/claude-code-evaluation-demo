// Same pill shape as StatusBadge; danger color per the design system's expired/error mapping.
export default function SlaBadge() {
  return (
    <span className="whitespace-nowrap rounded bg-danger px-2 py-0.5 text-sm leading-tight text-white">
      SLA breached
    </span>
  );
}
