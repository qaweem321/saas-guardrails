"use server";

import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { memberships } from "@/db/schema";
import { requireOwner } from "@/lib/session";

export async function removeMember(formData: FormData) {
  const { organization, user } = await requireOwner(String(formData.get("slug")));
  const membershipId = String(formData.get("membershipId"));
  if (membershipId === user.membershipId) {
    throw new Error("You can't remove yourself.");
  }

  const owners = await db.$count(
    memberships,
    and(eq(memberships.organizationId, organization.id), eq(memberships.role, "owner")),
  );
  if (owners <= 1) {
    throw new Error("The organization needs at least one owner.");
  }
  await db
    .delete(memberships)
    .where(and(eq(memberships.id, membershipId), eq(memberships.organizationId, organization.id)));
}
