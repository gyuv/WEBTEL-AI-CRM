import { prisma } from "@/lib/prisma";
import { requirePageActor } from "@/server/session";
import { ActionForm } from "@/components/action-form";
import { changePasswordAction, updateProfileAction } from "@/app/actions/crm";
import { Card, CardContent, CardHeader, CardTitle, Field, Input } from "@/components/ui";

export default async function ProfilePage() {
  const actor = await requirePageActor();
  const me = await prisma.user.findUniqueOrThrow({ where: { id: actor.id }, select: { name: true, email: true, role: true } });
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card><CardHeader><CardTitle>Profile</CardTitle></CardHeader><CardContent>
        <ActionForm action={updateProfileAction} resetOnSuccess={false}>
          <Field label="Name"><Input name="name" defaultValue={me.name} required /></Field>
          <p className="mt-2 text-xs text-muted-foreground">{me.email} · {me.role}</p>
        </ActionForm>
      </CardContent></Card>
      <Card><CardHeader><CardTitle>Change Password</CardTitle></CardHeader><CardContent>
        <ActionForm action={changePasswordAction} submitLabel="Change password">
          <Field label="Current password"><Input type="password" name="currentPassword" required /></Field>
          <Field label="New password (min 8 chars)" className="mt-2"><Input type="password" name="newPassword" minLength={8} required /></Field>
        </ActionForm>
      </CardContent></Card>
    </div>
  );
}
