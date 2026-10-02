import { handlePostRevisions } from '../../../_lib/api-core.js';

export async function onRequest(context) {
  return handlePostRevisions(context.request, context.env, context.params.id);
}
export async function onRequestOptions(context) {
  return handlePostRevisions(context.request, context.env, context.params.id);
}
