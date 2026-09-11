"use client";

import AuthGate from "@/components/AuthGate";
import RoutineApp from "@/components/RoutineApp";
import AnimatorWorkspaceReturnBand from "@/components/AnimatorWorkspaceReturnBand";

export default function Page() {
  return (
    <>
      <AnimatorWorkspaceReturnBand />
      <AuthGate>
        <RoutineApp />
      </AuthGate>
    </>
  );
}
