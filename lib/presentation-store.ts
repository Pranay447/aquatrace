import { db } from "./db";
import { presentationSchema, type Presentation } from "./presentation";
export async function presentationState(): Promise<Presentation> {
  if (process.env.LOCAL_DEMONSTRATION !== "true") return { events: [] };
  const record = await db.setting.findUnique({ where: { id: "presentation" } });
  const parsed = presentationSchema.safeParse(record?.thresholds);
  return parsed.success ? parsed.data : { events: [] };
}
