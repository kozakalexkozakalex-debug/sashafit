"use client";

import { useState } from "react";
import ExerciseLibrary from "@/components/ExerciseLibrary";
import ProgramsLibrary from "@/components/ProgramsLibrary";

type SubTab = "exercises" | "programs";

export default function ProgramsSection() {
  const [sub, setSub] = useState<SubTab>("exercises");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-5">
        <button
          type="button"
          onClick={() => setSub("exercises")}
          className={`font-display text-sm font-medium ${
            sub === "exercises" ? "text-accent" : "text-muted"
          }`}
        >
          База вправ
        </button>
        <button
          type="button"
          onClick={() => setSub("programs")}
          className={`font-display text-sm font-medium ${
            sub === "programs" ? "text-accent" : "text-muted"
          }`}
        >
          Програми
        </button>
      </div>
      {sub === "exercises" ? <ExerciseLibrary /> : <ProgramsLibrary />}
    </div>
  );
}
