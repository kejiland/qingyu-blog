import { handlePostRevisionRestore } from '../../../../../_lib/api-core.js';

export async function onRequest(context) {
  return handlePostRevisionRestore(context.request, context.env, context.params.id, context.params.revision);
}
export async function onRequestOptions(context) {
  return handlePostRevisionRestore(context.request, context.env, context.params.id, context.params.revision);
}
