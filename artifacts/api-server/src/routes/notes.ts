import { Router, type IRouter } from "express";
import { desc, eq } from "drizzle-orm";
import { db, notesTable } from "@workspace/db";
import {
  CreateNoteBody,
  UpdateNoteParams,
  UpdateNoteBody,
  UpdateNoteResponse,
  DeleteNoteParams,
  ListNotesResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/notes", async (_req, res): Promise<void> => {
  const notes = await db.select().from(notesTable).orderBy(desc(notesTable.updatedAt));

  const serialized = notes.map((n) => ({
    ...n,
    createdAt: n.createdAt.toISOString(),
    updatedAt: n.updatedAt.toISOString(),
  }));

  res.json(ListNotesResponse.parse(serialized));
});

router.post("/notes", async (req, res): Promise<void> => {
  const parsed = CreateNoteBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [note] = await db.insert(notesTable).values(parsed.data).returning();

  res.status(201).json({
    ...note,
    createdAt: note.createdAt.toISOString(),
    updatedAt: note.updatedAt.toISOString(),
  });
});

router.patch("/notes/:id", async (req, res): Promise<void> => {
  const params = UpdateNoteParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateNoteBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [note] = await db
    .update(notesTable)
    .set(parsed.data)
    .where(eq(notesTable.id, params.data.id))
    .returning();

  if (!note) {
    res.status(404).json({ error: "Note not found" });
    return;
  }

  res.json(
    UpdateNoteResponse.parse({
      ...note,
      createdAt: note.createdAt.toISOString(),
      updatedAt: note.updatedAt.toISOString(),
    })
  );
});

router.delete("/notes/:id", async (req, res): Promise<void> => {
  const params = DeleteNoteParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [note] = await db
    .delete(notesTable)
    .where(eq(notesTable.id, params.data.id))
    .returning();

  if (!note) {
    res.status(404).json({ error: "Note not found" });
    return;
  }

  res.sendStatus(204);
});

export default router;
