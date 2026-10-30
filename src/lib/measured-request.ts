/** Keep expensive reports from competing for the database's per-request time budget.
 * Share only in-flight requests for the same client and parameters; never cache results.
 */
let tail: Promise<void> = Promise.resolve();
const pending = new WeakMap<object, Map<string, Promise<unknown>>>();
export function measuredRequest<T>(client: object, key: string, request: () => Promise<T>): Promise<T> {
  let requests = pending.get(client);
  if (!requests) { requests = new Map(); pending.set(client, requests); }
  const existing = requests.get(key);
  if (existing) return existing as Promise<T>;
  const result = tail.then(request);
  tail = result.then(() => undefined, () => undefined);
  requests.set(key, result);
  const clear = () => { if (requests.get(key) === result) requests.delete(key); };
  void result.then(clear, clear);
  return result;
}
