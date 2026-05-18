import { json, requireUser } from "../../../_utils";
import {
  normalizeWorkspaceId,
  requireWorkspaceBucket,
  workspaceFileKey,
} from "../../_workspace_utils";

export async function onRequestGet(context) {
  const auth = await requireUser(context);
  if (auth.error) return auth.error;

  const bucketResult = requireWorkspaceBucket(context.env);
  if (bucketResult.error) return bucketResult.error;

  const workspaceId = normalizeWorkspaceId(context.params.workspaceId);
  const fileId = String(context.params.fileId || "").trim();
  if (!workspaceId || !fileId) return json({ error: "workspaceId and fileId are required" }, { status: 400 });

  const object = await bucketResult.bucket.get(workspaceFileKey(auth.user.id, workspaceId, fileId));
  if (!object) return new Response("Not Found", { status: 404 });

  return new Response(object.body, {
    status: 200,
    headers: {
      "content-type": object.httpMetadata?.contentType || "application/octet-stream",
      "cache-control": "no-store",
    },
  });
}

export async function onRequestDelete(context) {
  const auth = await requireUser(context);
  if (auth.error) return auth.error;

  const bucketResult = requireWorkspaceBucket(context.env);
  if (bucketResult.error) return bucketResult.error;

  const workspaceId = normalizeWorkspaceId(context.params.workspaceId);
  const fileId = String(context.params.fileId || "").trim();
  if (!workspaceId || !fileId) return json({ error: "workspaceId and fileId are required" }, { status: 400 });

  await bucketResult.bucket.delete(workspaceFileKey(auth.user.id, workspaceId, fileId));
  return json({ ok: true });
}
