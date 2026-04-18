/** Safely convert a value to an iterable array.
 *  Wasmoon converts empty Lua tables `{}` to plain JS `{}` (not `[]`),
 *  which breaks `for...of`. This helper normalises the value. */
export function toIterable<T>(v: T[] | Iterable<T> | null | undefined | Record<string, unknown>): T[] {
    if (v == null) return [];
    if (Array.isArray(v)) return v;
    if (typeof (v as any)[Symbol.iterator] === 'function') return Array.from(v as Iterable<T>);
    return [];
}
