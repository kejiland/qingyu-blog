import { handleSubscribersAdmin } from '../../_lib/subscribe.js';
export async function onRequest(context) { return handleSubscribersAdmin(context.request, context.env); }
export async function onRequestOptions(context) { return handleSubscribersAdmin(context.request, context.env); }
