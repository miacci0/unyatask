"use client";

import AuthGate from "@/components/AuthGate";
import RoutineApp from "@/components/RoutineApp";

export default function Page() {
  return (
    <AuthGate>
      <RoutineApp />
    </AuthGate>
  );
}
