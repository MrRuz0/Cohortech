export function ChurnRiskBadge({ score }: { score: number }) {
  let label = "Bajo";
  let className = "bg-green-100 text-green-700";

  if (score >= 0.7) {
    label = "Alto";
    className = "bg-red-100 text-red-700";
  } else if (score >= 0.4) {
    label = "Medio";
    className = "bg-yellow-100 text-yellow-700";
  }

  return (
    <span className={`rounded-full px-2 py-1 text-xs font-medium ${className}`}>
      {label}
    </span>
  );
}
