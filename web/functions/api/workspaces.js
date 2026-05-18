import { json, requireUser } from "./_utils";
import { readManifest, requireWorkspaceBucket } from "./workspaces/_workspace_utils";

export async function onRequestGet(context) {
  const auth = await requireUser(context);
  if (auth.error) return auth.error;

  const bucketResult = requireWorkspaceBucket(context.env);
  if (bucketResult.error) return bucketResult.error;

  const manifest = await readManifest(bucketResult.bucket, auth.user.id);
  return json(manifest);
}
