# Rate Limiting Configuration

This document describes rate limiting strategies and recommendations for the Urban Hub Booking Portal.

## Current Status

⚠️ **Rate limiting is not currently implemented** but is recommended for production deployment.

## Recommended Rate Limiting Strategy

### 1. Edge Functions Rate Limiting

Supabase Edge Functions have built-in rate limiting, but you can add additional protection:

#### Option A: Supabase Native (Recommended)
- Supabase automatically rate limits edge functions
- Default: ~100 requests per second per function
- Can be adjusted in Supabase Dashboard

#### Option B: Cloudflare (If Using)
- Add Cloudflare in front of your Supabase project
- Configure rate limiting rules
- Protect against DDoS attacks

### 2. Frontend Rate Limiting

Implement client-side rate limiting for critical actions:

#### Login/Registration
- Max 5 attempts per 15 minutes per IP
- Lock account after 10 failed attempts

#### Payment Requests
- Max 3 payment intents per minute per user
- Prevent rapid-fire payment attempts

#### Form Submissions
- Debounce form submissions
- Prevent duplicate submissions

### 3. Database Query Rate Limiting

- Use connection pooling (Supabase handles this)
- Implement query timeouts
- Monitor slow queries

## Implementation Recommendations

### High Priority (Before Production)

1. **Stripe Webhook Rate Limiting**
   - Stripe automatically rate limits webhooks
   - Implement idempotency keys
   - Handle webhook retries gracefully

2. **Authentication Rate Limiting**
   - Use Supabase Auth built-in rate limiting
   - Consider adding CAPTCHA after 3 failed attempts
   - Implement account lockout after repeated failures

3. **API Endpoint Protection**
   - Rate limit edge functions at application level
   - Use middleware for common endpoints
   - Log and alert on rate limit violations

### Medium Priority (Within 1 Month)

1. **Form Submission Protection**
   - Implement CSRF tokens
   - Rate limit form submissions
   - Prevent duplicate submissions

2. **Email Sending Limits**
   - Limit bulk message sending
   - Implement queue system for large batches
   - Monitor email delivery rates

### Low Priority (Future Enhancement)

1. **Advanced Rate Limiting**
   - Per-user rate limits
   - Tiered rate limits based on user role
   - Dynamic rate limiting based on system load

## Implementation Examples

### Edge Function Rate Limiting Middleware

```typescript
// Example: Rate limiting middleware for edge functions
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function rateLimit(identifier: string, maxRequests: number, windowMs: number): boolean {
  const now = Date.now();
  const record = rateLimitMap.get(identifier);
  
  if (!record || now > record.resetAt) {
    rateLimitMap.set(identifier, { count: 1, resetAt: now + windowMs });
    return true;
  }
  
  if (record.count >= maxRequests) {
    return false; // Rate limit exceeded
  }
  
  record.count++;
  return true;
}

// Usage in edge function
serve(async (req) => {
  const userId = await getUserId(req);
  if (!rateLimit(userId, 10, 60000)) { // 10 requests per minute
    return new Response(JSON.stringify({ error: "Rate limit exceeded" }), {
      status: 429,
      headers: { "Retry-After": "60" },
    });
  }
  // ... rest of function
});
```

### Frontend Rate Limiting

```typescript
// Example: Client-side rate limiting
class RateLimiter {
  private requests: Map<string, number[]> = new Map();
  
  canMakeRequest(key: string, maxRequests: number, windowMs: number): boolean {
    const now = Date.now();
    const timestamps = this.requests.get(key) || [];
    
    // Remove old timestamps
    const recent = timestamps.filter(ts => now - ts < windowMs);
    
    if (recent.length >= maxRequests) {
      return false;
    }
    
    recent.push(now);
    this.requests.set(key, recent);
    return true;
  }
}

const limiter = new RateLimiter();

// Usage
if (!limiter.canMakeRequest('payment', 3, 60000)) {
  toast.error("Too many requests. Please wait a moment.");
  return;
}
```

## Monitoring

### Metrics to Track

1. **Rate Limit Violations**
   - Number of 429 responses
   - IP addresses hitting limits
   - Endpoints most frequently rate limited

2. **Request Patterns**
   - Peak request times
   - Unusual traffic patterns
   - Potential attack patterns

3. **System Performance**
   - Response times under load
   - Error rates
   - Database query performance

### Alerting

Set up alerts for:
- High rate of 429 responses
- Unusual traffic spikes
- Repeated rate limit violations from same IP
- System performance degradation

## Best Practices

1. **Graceful Degradation**
   - Return clear error messages
   - Include `Retry-After` header
   - Don't block legitimate users

2. **User Communication**
   - Explain rate limits to users
   - Provide retry instructions
   - Consider showing remaining requests

3. **Whitelisting**
   - Whitelist trusted IPs (admin, staff)
   - Higher limits for authenticated users
   - Different limits per user role

4. **Monitoring**
   - Log all rate limit violations
   - Track patterns over time
   - Adjust limits based on data

## Configuration Recommendations

### Development
- No rate limiting (or very high limits)
- Log all rate limit checks
- Easy to test and debug

### Staging
- Production-like rate limits
- Monitor and adjust
- Test edge cases

### Production
- Strict rate limits
- Monitor closely
- Adjust based on real usage

## Next Steps

1. **Immediate**: Rely on Supabase's built-in rate limiting
2. **Short-term**: Add application-level rate limiting for critical endpoints
3. **Long-term**: Implement advanced rate limiting with monitoring

---

**Last Updated:** 2025-11-20  
**Status:** Documentation complete, implementation pending

