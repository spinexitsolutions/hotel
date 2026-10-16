import { formatMoney } from '@aurelle/shared';

export interface Brand {
  name: string;
  phone: string;
  email: string;
  address: string;
  appUrl: string;
  primary: string;
  dark: string;
}

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

function layout(brand: Brand, title: string, bodyHtml: string, cta?: { label: string; href: string }) {
  return `<!doctype html><html><body style="margin:0;background:#f4efe6;font-family:Georgia,'Times New Roman',serif;color:#1c1a17">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4efe6;padding:32px 12px"><tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fffdf8;border:1px solid #e3d8c4">
<tr><td style="background:${esc(brand.dark)};padding:28px 40px;text-align:center">
<div style="font-size:24px;letter-spacing:6px;color:${esc(brand.primary)};text-transform:uppercase">${esc(brand.name)}</div></td></tr>
<tr><td style="padding:40px">
<h1 style="font-weight:400;font-size:26px;margin:0 0 20px">${esc(title)}</h1>
<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.65;color:#3a362f">${bodyHtml}</div>
${cta ? `<p style="margin:32px 0 0"><a href="${esc(cta.href)}" style="display:inline-block;background:${esc(brand.dark)};color:${esc(brand.primary)};padding:14px 28px;text-decoration:none;font-family:Arial,sans-serif;font-size:12px;letter-spacing:2px;text-transform:uppercase">${esc(cta.label)}</a></p>` : ''}
</td></tr>
<tr><td style="padding:24px 40px;border-top:1px solid #e3d8c4;font-family:Arial,sans-serif;font-size:12px;color:#7a7266;text-align:center">
${esc(brand.name)} · ${esc(brand.address)}<br>${esc(brand.phone)} · ${esc(brand.email)}</td></tr>
</table></td></tr></table></body></html>`;
}

export interface BookingEmailData {
  reference: string;
  guestName: string;
  roomName: string;
  checkIn: string;
  checkOut: string;
  nights: number;
  rooms: number;
  adults: number;
  children: number;
  grandTotal: number;
  amountPaid: number;
  paymentMethod: string;
  statusLabel: string;
  manageUrl: string;
  checkInTime: string;
  checkOutTime: string;
}

const fmtDate = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

function bookingTable(b: BookingEmailData) {
  const row = (k: string, v: string) => `<tr><td style="padding:6px 0;color:#7a7266;width:45%">${esc(k)}</td><td style="padding:6px 0">${esc(v)}</td></tr>`;
  return `<table role="presentation" width="100%" style="border-top:1px solid #e3d8c4;border-bottom:1px solid #e3d8c4;margin:20px 0;padding:8px 0;font-size:14px">
${row('Reference', b.reference)}${row('Accommodation', `${b.roomName}${b.rooms > 1 ? ` × ${b.rooms}` : ''}`)}
${row('Arrival', `${fmtDate(b.checkIn)} from ${b.checkInTime}`)}${row('Departure', `${fmtDate(b.checkOut)} by ${b.checkOutTime}`)}
${row('Guests', `${b.adults} adult(s)${b.children ? `, ${b.children} child(ren)` : ''}`)}${row('Total', formatMoney(b.grandTotal))}
${row('Paid', formatMoney(b.amountPaid))}${row('Payment', b.paymentMethod === 'PAY_AT_HOTEL' ? 'Pay at the hotel' : 'Online')}${row('Status', b.statusLabel)}</table>`;
}

export type Rendered = { subject: string; html: string; text: string };

export const templates = {
  bookingConfirmed(brand: Brand, b: BookingEmailData): Rendered {
    return {
      subject: `Your stay is confirmed — ${b.reference}`,
      html: layout(brand, `We look forward to welcoming you, ${b.guestName}.`, `<p>Your reservation at ${esc(brand.name)} is confirmed.</p>${bookingTable(b)}<p>Should you wish to arrange airport transfers, dining or spa rituals before arrival, simply reply to this email.</p>`, { label: 'View reservation', href: b.manageUrl }),
      text: `Your stay is confirmed. Reference ${b.reference}. ${b.roomName}, ${b.checkIn} → ${b.checkOut}. Total ${formatMoney(b.grandTotal)}. Manage: ${b.manageUrl}`,
    };
  },
  bookingReceived(brand: Brand, b: BookingEmailData): Rendered {
    return {
      subject: `We have received your reservation request — ${b.reference}`,
      html: layout(brand, 'Thank you for your reservation request', `<p>Dear ${esc(b.guestName)}, our reservations team is reviewing your request and will confirm shortly.</p>${bookingTable(b)}`, { label: 'View reservation', href: b.manageUrl }),
      text: `Reservation request received: ${b.reference}. We will confirm shortly. ${b.manageUrl}`,
    };
  },
  bookingCancelled(brand: Brand, b: BookingEmailData, extra: { reason?: string; refundable: number }): Rendered {
    return {
      subject: `Reservation cancelled — ${b.reference}`,
      html: layout(brand, 'Your reservation has been cancelled', `<p>Dear ${esc(b.guestName)}, reservation <strong>${esc(b.reference)}</strong> has been cancelled.${extra.reason ? ` Reason: ${esc(extra.reason)}.` : ''}</p>
${extra.refundable > 0 ? `<p>A refund of <strong>${esc(formatMoney(extra.refundable))}</strong> will be processed to your original payment method. You will receive a separate confirmation once it has been issued.</p>` : ''}<p>We hope to welcome you another time.</p>`),
      text: `Reservation ${b.reference} cancelled.${extra.refundable > 0 ? ` Refund due: ${formatMoney(extra.refundable)}.` : ''}`,
    };
  },
  bookingStatus(brand: Brand, b: BookingEmailData, message: string): Rendered {
    return {
      subject: `Reservation update — ${b.reference}`,
      html: layout(brand, 'An update on your reservation', `<p>Dear ${esc(b.guestName)}, ${esc(message)}</p>${bookingTable(b)}`, { label: 'View reservation', href: b.manageUrl }),
      text: `Reservation ${b.reference}: ${message}`,
    };
  },
  paymentFailed(brand: Brand, b: BookingEmailData): Rendered {
    return {
      subject: `Payment not completed — ${b.reference}`,
      html: layout(brand, 'Your payment did not go through', `<p>Dear ${esc(b.guestName)}, we were unable to complete the payment for reservation ${esc(b.reference)}. No amount has been captured. You can retry while your room is held.</p>`, { label: 'Retry payment', href: b.manageUrl }),
      text: `Payment for ${b.reference} was not completed. Retry: ${b.manageUrl}`,
    };
  },
  refundProcessed(brand: Brand, data: { guestName: string; reference: string; amount: number }): Rendered {
    return {
      subject: `Refund issued — ${data.reference}`,
      html: layout(brand, 'Your refund has been issued', `<p>Dear ${esc(data.guestName)}, a refund of <strong>${esc(formatMoney(data.amount))}</strong> for reservation ${esc(data.reference)} has been issued. Depending on your bank it may take 5–7 working days to appear.</p>`),
      text: `Refund of ${formatMoney(data.amount)} issued for ${data.reference}.`,
    };
  },
  contactAck(brand: Brand, data: { name: string; subject: string }): Rendered {
    return {
      subject: `Thank you for contacting ${brand.name}`,
      html: layout(brand, `Thank you, ${data.name}`, `<p>We have received your message${data.subject ? ` regarding “${esc(data.subject)}”` : ''}. A member of our team will reply within one business day.</p>`),
      text: `Thank you for contacting ${brand.name}. We will reply within one business day.`,
    };
  },
  staffAlert(brand: Brand, data: { title: string; lines: string[]; link: string }): Rendered {
    return {
      subject: `[${brand.name}] ${data.title}`,
      html: layout(brand, data.title, data.lines.map((l) => `<p>${esc(l)}</p>`).join(''), { label: 'Open in admin', href: data.link }),
      text: `${data.title}\n${data.lines.join('\n')}\n${data.link}`,
    };
  },
  passwordReset(brand: Brand, data: { name: string; url: string }): Rendered {
    return {
      subject: `Reset your ${brand.name} password`,
      html: layout(brand, 'Reset your password', `<p>Dear ${esc(data.name)}, use the button below to choose a new password. The link expires in 60 minutes. If you did not request this, you can ignore this email.</p>`, { label: 'Reset password', href: data.url }),
      text: `Reset your password (valid 60 minutes): ${data.url}`,
    };
  },
  welcome(brand: Brand, data: { name: string }): Rendered {
    return {
      subject: `Welcome to ${brand.name}`,
      html: layout(brand, `Welcome, ${data.name}`, '<p>Your account is ready. You can view and manage reservations, save favourite suites and enjoy faster booking.</p>', { label: 'Visit your account', href: `${brand.appUrl}/account` }),
      text: `Welcome to ${brand.name}.`,
    };
  },
  newsletterWelcome(brand: Brand, data: { unsubscribeUrl: string }): Rendered {
    return {
      subject: `You are on the list — ${brand.name}`,
      html: layout(brand, 'Thank you for subscribing', `<p>Expect seasonal offers, new experiences and stories from the palace — never more than twice a month.</p><p style="font-size:12px;color:#7a7266">Changed your mind? <a href="${esc(data.unsubscribeUrl)}">Unsubscribe</a>.</p>`),
      text: `Subscribed. Unsubscribe: ${data.unsubscribeUrl}`,
    };
  },
};
