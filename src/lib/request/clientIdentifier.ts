export const extractClientIdentifier = (headers: Headers): string => {
  const forwardedFor = headers.get('x-forwarded-for');
  if (forwardedFor) {
    const [first] = forwardedFor.split(',');
    if (first) {
      return first.trim();
    }
  }

  const realIp = headers.get('x-real-ip');
  if (realIp) {
    return realIp.trim();
  }

  const forwardedProto = headers.get('forwarded');
  if (forwardedProto) {
    const match = forwardedProto.match(/for="?([^;,"]+)"?/i);
    if (match?.[1]) {
      return match[1];
    }
  }

  return 'unknown';
};
