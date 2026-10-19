"use client";

import { useState } from "react";
import ExerciseLibrary from "@/components/ExerciseLibrary";
import ProgramsLibrary from "@/components/ProgramsLibrary";

type SubTab = "exercises" | "programs";

export default function ProgramsSection() {
  const [sub, setSub] = useState<SubTab>("exercises");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-5 border-b border-line">
        <button
          type="button"
          onClick={() => setSub("exercises")}
          className={`-mb-px border-b-2 pb-2 font-display text-sm font-medium transition ${
            sub === "exercises" ? "border-accent text-accent" : "border-transparent text-muted hover:text-ink"
          }`}
        >
          База вправ
        </button>
        <button
          type="button"
          onClick={() => setSub("programs")}
          className={`-mb-px border-b-2 pb-2 font-display text-sm font-medium transition ${
            sub === "programs" ? "border-accent text-accent" : "border-transparent text-muted hover:text-ink"
          }`}
        >
          Програми
        </button>
      </div>
      {sub === "exercises" ? <ExerciseLibrary /> : <ProgramsLibrary />}
    </div>
  );
}
