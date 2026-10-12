import { api, body } from '../../api/client';
import type { Booking, BookingStatus, Page } from '../../api/types';

export const listBookings = async (siteId: string, cursor: string | undefined): Promise<Page<Booking>> =>
  body(
    await api.GET('/v1/sites/{site_id}/bookings', {
      params: { path: { site_id: siteId }, query: { limit: 50, cursor } },
    }),
  );

export const setBookingStatus = async (siteId: string, bookingId: string, status: BookingStatus): Promise<Booking> =>
  body(
    await api.PATCH('/v1/sites/{site_id}/bookings/{booking_id}', {
      params: { path: { site_id: siteId, booking_id: bookingId } },
      body: { status },
    }),
  );
