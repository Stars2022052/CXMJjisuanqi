import { createFileRoute } from "@tanstack/react-router";
import { TideApp } from "@/components/tide-app";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return <TideApp />;
}
