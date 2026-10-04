// Which addresses may open Undercurrent: this Mac and devices on a private network (home Wi-Fi, 192.168.x.x,
// 10.x.x.x, 172.16 to 31.x.x), never a public address.
const PRIVATE = [/^127\./, /^10\./, /^192\.168\./, /^172\.(1[6-9]|2\d|3[01])\./, /^169\.254\./, /^::1$/, /^f[cd][0-9a-f]{2}:/i, /^fe80:/i];

export function isPrivateAddress(addr) {
  const a = String(addr || '').replace(/^::ffff:/i, '');
  return PRIVATE.some((re) => re.test(a));
}
