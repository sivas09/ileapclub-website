export function CenterDirectorScopeView({ centres }: { centres: Array<{ id: string; name: string }> | null }) {
  if (centres === null) {
    return <p className="loading-state">Loading assigned centres...</p>;
  }

  if (!centres.length) {
    return <p className="admin-status is-error" role="alert">No centre has been assigned to your account. Please contact the administrator.</p>;
  }

  return (
    <section className="student-context-card" aria-label="Assigned centres">
      <strong>Assigned {centres.length === 1 ? "Centre" : "Centres"}</strong>
      <span>{centres.map((centre) => centre.name).join(", ")}</span>
    </section>
  );
}
