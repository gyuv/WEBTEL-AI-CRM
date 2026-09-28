import { prisma } from "@/lib/prisma";
import { requirePageActor } from "@/server/session";
import { fmtDate } from "@/lib/format";
import { ActionForm } from "@/components/action-form";
import { AdminOnly } from "@/components/settings-nav";
import { createUserAction, toggleUserAction } from "@/app/actions/crm";
import { Badge, Card, CardContent, CardHeader, CardTitle, Field, Input, Select, Table, Td, Th } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const actor = await requirePageActor();
  if (actor.role !== "ADMIN") return <AdminOnly />;
  const users = await prisma.user.findMany({ orderBy: { createdAt: "asc" }, select: { id: true, name: true, email: true, role: true, active: true, createdAt: true, _count: { select: { leads: true } } } });
  return (
    <div className="space-y-4">
      <Card><CardHeader><CardTitle>Add User</CardTitle></CardHeader><CardContent>
        <ActionForm action={createUserAction} submitLabel="Create User">
          <div className="grid gap-2 md:grid-cols-4">
            <Field label="Name"><Input name="name" required /></Field>
            <Field label="Email"><Input name="email" type="email" required /></Field>
            <Field label="Password (min 8)"><Input name="password" type="password" minLength={8} required /></Field>
            <Field label="Role"><Select name="role"><option>USER</option><option>ADMIN</option></Select></Field>
          </div>
        </ActionForm>
      </CardContent></Card>
      <Card>
        <Table>
          <thead><tr><Th>Name</Th><Th>Email</Th><Th>Role</Th><Th>Leads</Th><Th>Created</Th><Th>Status</Th><Th /></tr></thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <Td>{u.name}</Td><Td>{u.email}</Td><Td><Badge tone="x">{u.role}</Badge></Td><Td>{u._count.leads}</Td><Td>{fmtDate(u.createdAt)}</Td>
                <Td><Badge tone={u.active ? "COMPLETED" : "LOST"}>{u.active ? "Active" : "Disabled"}</Badge></Td>
                <Td>{u.id !== actor.id && <ActionForm action={toggleUserAction.bind(null, u.id, !u.active)} submitLabel={u.active ? "Disable" : "Enable"} />}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}
