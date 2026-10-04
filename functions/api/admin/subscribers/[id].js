import { handleSubscriberId } from '../../../_lib/subscribe.js';
export async function onRequest(context) { return handleSubscriberId(context.request, context.env, context.params.id); }
export async function onRequestPut(context) { return handleSubscriberId(context.request, context.env, context.params.id); }
export async function onRequestDelete(context) { return handleSubscriberId(context.request, context.env, context.params.id); }
export async function onRequestOptions(context) { return handleSubscriberId(context.request, context.env, context.params.id); }
