import { useQuery } from "@tanstack/react-query";

import { apiFetch } from "../shared/api";
import { Structure } from "../shared/types";

const fetchStructures = async (): Promise<Structure[]> => {
  return apiFetch<Structure[]>("/api/v1/structures/");
};

export const StructuresPage = () => {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["structures"],
    queryFn: fetchStructures
  });

  if (isLoading) {
    return <p>Loading structures…</p>;
  }

  if (isError) {
    return <p>Unable to load structures. Please try again later.</p>;
  }

  if (!data || data.length === 0) {
    return (
      <section>
        <div className="card">
          <h2>Structures</h2>
          <p>No structures have been added yet. Start by creating one from the API.</p>
        </div>
      </section>
    );
  }

  return (
    <section>
      <div className="card">
        <h2>Structures</h2>
        <ul>
          {data.map((structure) => (
            <li key={structure.id}>
              <strong>{structure.name}</strong> — {structure.province ?? "N/A"} — {structure.type}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
};
