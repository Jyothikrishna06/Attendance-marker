/**
 * Subnet & IPv4 CIDR matching utility functions.
 * Evaluates whether an incoming client IP falls within authorized hostel subnets.
 */

/**
 * Normalizes IPv4 addresses, stripping IPv6-mapped IPv4 prefixes (e.g., '::ffff:10.42.0.1')
 * and mapping IPv6 loopback ('::1') to '127.0.0.1'.
 */
export function normalizeIp(rawIp: string): string {
  if (!rawIp) {
    return '127.0.0.1';
  }

  let ip = rawIp.trim();

  // Strip port if present (e.g. "192.168.1.1:54321")
  if (ip.includes('.') && ip.includes(':')) {
    const colonIndex = ip.lastIndexOf(':');
    const bracketIndex = ip.indexOf(']');
    // If it's an IPv6 bracket format like "[::ffff:192.168.1.1]:8080"
    if (ip.startsWith('[') && bracketIndex !== -1) {
      ip = ip.substring(1, bracketIndex);
    } else if (!ip.startsWith('::ffff:')) {
      // Standard IPv4:port
      ip = ip.substring(0, colonIndex);
    }
  }

  if (ip === '::1' || ip === 'localhost') {
    return '127.0.0.1';
  }

  if (ip.startsWith('::ffff:')) {
    ip = ip.substring(7);
  }

  return ip;
}

/**
 * Converts a standard dotted-quad IPv4 string to an unsigned 32-bit integer.
 * Returns null if the string is not a valid IPv4 address.
 */
export function ipToLong(ip: string): number | null {
  const parts = ip.split('.');
  if (parts.length !== 4) {
    return null;
  }

  let result = 0;
  for (let i = 0; i < 4; i++) {
    const partNum = Number(parts[i]);
    if (!Number.isInteger(partNum) || partNum < 0 || partNum > 255 || parts[i].trim() !== partNum.toString()) {
      return null;
    }
    result = ((result << 8) | partNum) >>> 0;
  }

  return result;
}

/**
 * Checks whether a given client IP address is within a specified CIDR range (e.g., "10.42.0.0/16").
 * Supports single IPs without prefix (e.g., "127.0.0.1" which defaults to /32).
 */
export function isIpInCidr(clientIp: string, cidr: string): boolean {
  if (!clientIp || !cidr) {
    return false;
  }

  const normalizedIp = normalizeIp(clientIp);
  const ipLong = ipToLong(normalizedIp);
  if (ipLong === null) {
    return false;
  }

  const [networkAddress, prefixStr] = cidr.trim().split('/');
  const networkLong = ipToLong(normalizeIp(networkAddress));
  if (networkLong === null) {
    return false;
  }

  const prefix = prefixStr !== undefined ? parseInt(prefixStr, 10) : 32;
  if (isNaN(prefix) || prefix < 0 || prefix > 32) {
    return false;
  }

  if (prefix === 0) {
    return true; // 0.0.0.0/0 covers all IPv4
  }

  const mask = prefix === 32 ? 0xffffffff : ((-1 << (32 - prefix)) >>> 0);

  return ((ipLong & mask) >>> 0) === ((networkLong & mask) >>> 0);
}
