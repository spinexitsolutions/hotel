import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { calculateQuote } from '@aurelle/shared';
import { PriceSummary } from '@/components/site/PriceSummary';

describe('PriceSummary', () => {
  it('shows a transparent breakdown with discounts and taxes', () => {
    const quote = calculateQuote({
      checkIn: '2026-11-02', checkOut: '2026-11-04', rooms: 1, adults: 2, children: 0,
      roomType: { id: 'r', name: 'Suite', basePrice: 20_000_00, baseOccupancy: 2, extraAdultCharge: 0, extraChildCharge: 0, extraBedCharge: 0 },
      weekendDays: [5, 6], rateRules: [], holidays: [],
      coupon: { id: 'c', code: 'WELCOME10', discountType: 'PERCENT', value: 1000, roomTypeIds: [] },
      charges: [{ id: 't', name: 'GST', kind: 'TAX', calculation: 'PERCENT', value: 1800, appliesTo: 'ROOM', isActive: true }],
    });
    render(<PriceSummary quote={quote} roomName="Suite" />);
    expect(screen.getByText('Coupon WELCOME10')).toBeInTheDocument();
    expect(screen.getByText('GST (18%)')).toBeInTheDocument();
    expect(screen.getByText('₹42,480')).toBeInTheDocument(); // (40,000 − 4,000) × 1.18
  });
});
