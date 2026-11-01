import Monitor from "@/components/monitor";
import { notFound } from "next/navigation";
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ section: string[] }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { section } = await params;
  const query = await searchParams;
  if (
    ![
      "dashboard",
      "map",
      "sensors",
      "compare",
      "leaderboard",
      "alerts",
      "analytics",
      "settings",
    ].includes(section[0]) ||
    section.length > 2 ||
    (section.length === 2 && section[0] !== "sensors")
  )
    notFound();
  const initial = {
    sensor: typeof query.sensor === "string" ? query.sensor : "S04",
    a: typeof query.a === "string" ? query.a : "S03",
    b: typeof query.b === "string" ? query.b : "S04",
  };
  return (
    <Monitor
      key={section.join("/") + JSON.stringify(initial)}
      page={section[0]}
      sensorId={section[1]}
      initial={initial}
    />
  );
}
