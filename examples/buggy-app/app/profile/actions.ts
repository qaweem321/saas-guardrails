"use server";

import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { files, profiles } from "@/db/schema";
import { deleteFiles } from "@/lib/storage";
import { requireUser } from "@/lib/session";

// Saves the ID document photo chosen in the profile form (uploaded earlier, sent back as an id).
export async function saveIdDocument(formData: FormData) {
  const user = await requireUser();
  const fileId = String(formData.get("idDocumentFileId"));

  const [file] = await db.select().from(files).where(eq(files.id, fileId));
  if (!file || file.ownerId !== user.id) {
    return { error: "Please upload the photo again." };
  }

  const [before] = await db.select().from(profiles).where(eq(profiles.userId, user.id));
  await db.update(profiles).set({ idDocumentFileId: fileId }).where(eq(profiles.userId, user.id));
  if (before?.idDocumentFileId && before.idDocumentFileId !== fileId) {
    await deleteFiles([before.idDocumentFileId]);
  }
}
