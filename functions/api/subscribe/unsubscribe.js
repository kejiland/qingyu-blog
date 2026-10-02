import { handleUnsubscribe } from '../../_lib/subscribe.js';
export async function onRequest(context) { return handleUnsubscribe(context.request, context.env); }
