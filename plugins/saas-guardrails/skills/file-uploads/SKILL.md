---
name: file-uploads
description: Use when handling uploaded files - avatars, logos, documents, ID or license photos, attachments, signatures, product images, S3/R2/disk storage - especially when a form sends back file IDs. Prevents one user attaching or deleting someone else's files and evidence being wiped.
---

# File uploads and file IDs

The upload itself is usually fine. The bugs are in what happens **after**: a form sends a file ID
back, and the server attaches it, replaces it or deletes the old one.

## Rules

1. **Check the real type and size on the server.** Read the first bytes (magic numbers) for
   JPEG/PNG/WebP/PDF; never trust the file name or `Content-Type`. Cap the size before reading the
   whole body.
2. **Record who uploaded a file and who it belongs to**, as two columns (`uploaded_by_id`,
   `owner_id`). Staff may upload a photo *about* a customer (an inspection photo, a signature) that
   the customer may **see** but must not **reuse**.
3. **A file ID from the browser is untrusted.** Before attaching it, check in the same query that
   it exists, has the right visibility, and was uploaded by this user for this purpose:

   ```ts
   const found = await db.select({ id: files.id }).from(files).where(and(
     inArray(files.id, idsFromForm),
     eq(files.ownerId, user.id),
     eq(files.uploadedById, user.id),   // not a photo staff took of them
     eq(files.visibility, "private"),
   ));
   ```

4. **Only delete files nothing uses.** When a photo is replaced, delete the old one only if no
   other table still references it. Write that check once and reuse it everywhere (replace, remove,
   daily cleanup):

   ```ts
   export const fileNotInUse = () => and(
     sql`not exists (select 1 from product_photos where file_id = ${files.id})`,
     sql`not exists (select 1 from inspection_photos where file_id = ${files.id})`,
     sql`not exists (select 1 from agreements where signature_file_id = ${files.id})`,
     sql`not exists (select 1 from settings where logo_file_id = ${files.id})`,
   );

   export async function deleteUnusedFiles(ids: string[]) {
     const unused = await db.select({ id: files.id }).from(files)
       .where(and(inArray(files.id, ids), fileNotInUse()));
     await deleteFiles(unused.map((f) => f.id));
   }
   ```

   Without this, a customer who submits an inspection photo's ID in their profile form, then
   replaces it, deletes the evidence of a damage dispute.

5. **Serve private files through a route that checks access** (owner or staff), with
   `Cache-Control: private`, never from a public bucket URL.
6. **Clean up orphans** (uploaded, form abandoned) with a scheduled job using the same
   `fileNotInUse()` check and an age limit (older than a day).
7. **Delete the bytes, then the row**, or keep the row until storage confirms; and if saving the
   row fails after storing the bytes, remove the bytes.

## Checklist

- [ ] Magic-number type check and size cap on the server.
- [ ] `owner_id` and `uploaded_by_id` stored; attach checks both.
- [ ] One shared "not in use" check guards every delete.
- [ ] Private files served through an access-checked route.
- [ ] Orphan cleanup job.
