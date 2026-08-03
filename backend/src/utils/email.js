import { config } from '../config.js';

// Resend's plain HTTP API — no SDK dependency needed for one email type.
export async function sendPasswordResetEmail(to, resetUrl) {
  if (!config.resendApiKey) {
    // eslint-disable-next-line no-console
    console.log(`[password-reset] RESEND_API_KEY not set — reset link for ${to}: ${resetUrl}`);
    return { sent: false, reason: 'not_configured' };
  }
  try {
    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: config.resendFrom,
        to,
        subject: 'Reset your Assistant Platform password',
        html: `<p>Someone requested a password reset for your Assistant Platform account.</p>
<p><a href="${resetUrl}">Click here to reset your password</a> — this link expires in 1 hour.</p>
<p>If you didn't request this, you can safely ignore this email.</p>`,
      }),
      signal: AbortSignal.timeout(10000),
    });
    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      // eslint-disable-next-line no-console
      console.error(`[password-reset] Resend send failed (${resp.status}): ${text}`);
      return { sent: false, reason: 'send_failed' };
    }
    return { sent: true };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[password-reset] Resend send error:', err.message);
    return { sent: false, reason: 'send_error' };
  }
}
