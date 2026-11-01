import { redirect } from "next/navigation";
import { sessionUser } from "@/lib/auth";
import Workspace from "@/components/workspace";
export const dynamic = "force-dynamic";
export default async function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await sessionUser();
  if (!user) redirect("/login");
  return (
    <Workspace
      localMode={process.env.LOCAL_DEMONSTRATION === "true"}
      user={{
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        adminRequested: user.adminRequested,
      }}
    >
      {children}
    </Workspace>
  );
}
