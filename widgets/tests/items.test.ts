import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../src/api';
import { mountItems } from '../src/items';
import { addDays } from '../src/items-logic';
import type { BookOut, CatalogItem, DayAvailability } from '../src/types';
import { fakeApi, flush, room, shadowOf, type Call } from './fixtures';

const TODAY = '2030-05-10';

/** Availability: every day open at the item price, except the listed days. */
function availabilityFor(price: number, blocked: string[] = []): (c: Call) => unknown {
  return (call) => {
    if (call.method === 'POST') return { booking: booking(), checkout_url: null } satisfies BookOut;
    const q = new URLSearchParams(call.path.split('?')[1]);
    const days: DayAvailability[] = [];
    for (let d = q.get('from') ?? ''; d < (q.get('to') ?? ''); d = addDays(d, 1)) {
      days.push({ day: d, available: !blocked.includes(d), remaining: 1, price_cents: price });
    }
    return days;
  };
}

function booking(over: Partial<BookOut['booking']> = {}): BookOut['booking'] {
  return {
    booking_id: 'b1', item_id: 'i1', item_name: 'Sea room', start: '2030-05-15', end: '2030-05-18', slot: null,
    guests: 1, total_cents: 27000, currency: 'eur', status: 'CONFIRMED', cta_mode: 'book', ...over,
  };
}

let host: HTMLElement;
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(`${TODAY}T10:00:00`));
  host = document.createElement('div');
  document.body.replaceChildren(host);
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const root = (): ShadowRoot => shadowOf(host);
const q = <T extends Element>(sel: string): T => {
  const el = root().querySelector<T>(sel);
  if (!el) throw new Error(`missing ${sel}`);
  return el;
};
const day = (iso: string): HTMLButtonElement => q<HTMLButtonElement>(`[data-day="${iso}"]`);
const open = async (): Promise<void> => {
  q<HTMLButtonElement>('.card .btn').click();
  await flush();
};
const fillCustomer = (): void => {
  q<HTMLInputElement>('[name=name]').value = 'Ada Lovelace';
  q<HTMLInputElement>('[name=email]').value = 'ada@example.com';
};
const submit = (): void => {
  q<HTMLFormElement>('dialog form').dispatchEvent(new Event('submit', { cancelable: true }));
};

describe('card grid', () => {
  it('renders cards with CTA per cta_mode and localized currency', () => {
    const items: CatalogItem[] = [
      { ...room, cta_mode: 'request' },
      { ...room, slug: 'b', cta_mode: 'pay' },
      { ...room, slug: 'c', button_text: 'Reserve!' },
    ];
    mountItems(host, items, fakeApi().api, 'it', 'it');
    const labels = Array.from(root().querySelectorAll('.card .btn')).map((b) => b.textContent);
    expect(labels).toEqual(['Richiedi', 'Prenota e paga', 'Reserve!']);
    expect(root().querySelector('.price')?.textContent).toContain('100,00');
    expect(root().querySelector('.price')?.textContent).toContain('/ notte');
    expect(root().querySelectorAll('.card')).toHaveLength(3);
  });

  it('ignores non-https images', () => {
    mountItems(host, [{ ...room, image_url: 'http://x.example.com/a.jpg' }], fakeApi().api, 'en', 'en');
    expect(root().querySelector('.card img')).toBeNull();
  });
});

describe('room booking dialog', () => {
  it('lazily fetches the visible month with from/to/guests', async () => {
    const { api, calls } = fakeApi(availabilityFor(10000));
    mountItems(host, [room], api, 'en', 'en');
    expect(calls).toHaveLength(0);
    await open();
    expect(calls).toHaveLength(1);
    expect(calls[0]?.path).toBe('/items/sea-room/availability?from=2030-05-10&to=2030-06-01&guests=1');
    q<HTMLButtonElement>('.ch button[aria-label="Next month"]').click();
    await flush();
    expect(calls[1]?.path).toBe('/items/sea-room/availability?from=2030-06-01&to=2030-07-01&guests=1');
  });

  it('selects a range, estimates the price and posts the booking', async () => {
    const { api, calls } = fakeApi(availabilityFor(10000));
    mountItems(host, [room], api, 'en', 'en');
    await open();
    day('2030-05-15').click();
    await flush();
    day('2030-05-18').click();
    await flush();
    expect(day('2030-05-15').getAttribute('aria-pressed')).toBe('true');
    expect(day('2030-05-16').classList.contains('rng')).toBe(true);
    const summary = q('.est[role=status]').textContent ?? '';
    expect(summary).toContain('3 nights');
    expect(summary).toContain('€270.00');
    expect(summary).toContain('Estimate only');
    fillCustomer();
    submit();
    await flush();
    const post = calls.find((c) => c.method === 'POST');
    expect(post?.path).toBe('/items/sea-room/book');
    expect(post?.body).toEqual({ start: '2030-05-15', end: '2030-05-18', guests: 1, name: 'Ada Lovelace', email: 'ada@example.com' });
    expect(q('.ok h2').textContent).toBe('Booking confirmed. Thank you!');
  });

  it('refuses past days, unavailable nights and too-short stays', async () => {
    const { api } = fakeApi(availabilityFor(10000, ['2030-05-17']));
    mountItems(host, [room], api, 'en', 'en');
    await open();
    expect(day('2030-05-05').getAttribute('aria-disabled')).toBe('true');
    expect(day('2030-05-10').hasAttribute('aria-disabled')).toBe(false);
    day('2030-05-15').click();
    await flush();
    day('2030-05-16').click(); // 1 night < min_nights (2)
    await flush();
    expect(q('.status').textContent).toBe('Minimum stay (nights): 2');
    day('2030-05-19').click(); // crosses the unavailable night
    await flush();
    expect(q('.status').textContent).toBe('Those dates are not available. Please choose others.');
    expect(q('.est[role=status]').textContent).not.toContain('Estimated');
  });

  it('requires dates, validates the customer and never posts incomplete data', async () => {
    const { api, calls } = fakeApi(availabilityFor(10000));
    mountItems(host, [room], api, 'en', 'en');
    await open();
    submit();
    expect(q('.status').textContent).toBe('Select your dates');
    expect(q<HTMLInputElement>('[name=name]').getAttribute('aria-invalid')).toBe('true');
    expect(q<HTMLInputElement>('[name=email]').getAttribute('aria-invalid')).toBe('true');
    expect(calls.some((c) => c.method === 'POST')).toBe(false);
  });

  it('bounds guests by capacity and refetches availability with the new count', async () => {
    const { api, calls } = fakeApi(availabilityFor(10000));
    mountItems(host, [room], api, 'en', 'en');
    await open();
    const guests = q<HTMLInputElement>('[name=guests]');
    expect(guests.getAttribute('max')).toBe('2');
    guests.value = '9';
    guests.dispatchEvent(new Event('change'));
    await flush();
    expect(guests.value).toBe('2');
    expect(calls[calls.length - 1]?.path).toContain('guests=2');
  });

  it('on 409 not_available shows a message, clears the selection and refreshes availability', async () => {
    let conflict = true;
    const { api, calls } = fakeApi((c) => {
      if (c.method === 'POST' && conflict) return new ApiError(409, 'not_available', 'x');
      return availabilityFor(10000)(c);
    });
    mountItems(host, [room], api, 'en', 'en');
    await open();
    day('2030-05-15').click();
    await flush();
    day('2030-05-18').click();
    await flush();
    fillCustomer();
    const before = calls.filter((c) => c.method === 'GET').length;
    submit();
    await flush();
    conflict = false;
    expect(q('.status').textContent).toBe('Those dates are not available. Please choose others.');
    expect(calls.filter((c) => c.method === 'GET').length).toBe(before + 1);
    expect(day('2030-05-15').getAttribute('aria-pressed')).toBe('false');
    expect(q<HTMLButtonElement>('button[type=submit]').disabled).toBe(false);
  });

  it('navigates to an https checkout_url with the current page as return_url (pay mode)', async () => {
    const assign = vi.fn();
    vi.spyOn(window, 'location', 'get').mockReturnValue({
      protocol: 'https:', href: 'https://shop.example.com/rooms?x=1#top', origin: 'https://shop.example.com', pathname: '/rooms', assign,
    } as unknown as Location);
    const { api, calls } = fakeApi((c) =>
      c.method === 'POST' ? ({ booking: booking({ status: 'PENDING' }), checkout_url: 'https://checkout.stripe.com/c/pay_1' } satisfies BookOut) : availabilityFor(10000)(c),
    );
    mountItems(host, [{ ...room, cta_mode: 'pay' }], api, 'en', 'en');
    await open();
    day('2030-05-15').click();
    await flush();
    day('2030-05-17').click();
    await flush();
    fillCustomer();
    submit();
    await flush();
    expect((calls.find((c) => c.method === 'POST')?.body as { return_url: string }).return_url).toBe('https://shop.example.com/rooms?x=1');
    expect(assign).toHaveBeenCalledWith('https://checkout.stripe.com/c/pay_1');
  });

  it('never follows a non-https checkout_url', async () => {
    const assign = vi.fn();
    vi.spyOn(window, 'location', 'get').mockReturnValue({ protocol: 'https:', href: 'https://s.example.com/', origin: 'https://s.example.com', pathname: '/', assign } as unknown as Location);
    const { api } = fakeApi((c) =>
      c.method === 'POST' ? ({ booking: booking({ status: 'PENDING' }), checkout_url: 'javascript:alert(1)' } satisfies BookOut) : availabilityFor(10000)(c),
    );
    mountItems(host, [{ ...room, cta_mode: 'pay' }], api, 'en', 'en');
    await open();
    day('2030-05-15').click();
    await flush();
    day('2030-05-17').click();
    await flush();
    fillCustomer();
    submit();
    await flush();
    expect(assign).not.toHaveBeenCalled();
    expect(q('.ok')).toBeTruthy();
  });
});

describe('other item types', () => {
  it('experience: slot preselected, single day, slot sent in query and body', async () => {
    const exp: CatalogItem = { ...room, type: 'EXPERIENCE', slug: 'tour', capacity: 6, slots: ['09:00', '15:00'], price_cents: 5000, cta_mode: 'request' };
    const { api, calls } = fakeApi(availabilityFor(5000));
    mountItems(host, [exp], api, 'en', 'en');
    await open();
    expect(calls[0]?.path).toContain('slot=09%3A00');
    const slot = q<HTMLSelectElement>('[name=slot]');
    slot.value = '15:00';
    slot.dispatchEvent(new Event('change'));
    await flush();
    expect(calls[calls.length - 1]?.path).toContain('slot=15%3A00');
    day('2030-05-20').click();
    await flush();
    q<HTMLInputElement>('[name=guests]').value = '3';
    q<HTMLInputElement>('[name=guests]').dispatchEvent(new Event('change'));
    await flush();
    day('2030-05-20').click();
    await flush();
    expect(q('.est[role=status]').textContent).toContain('150.00');
    fillCustomer();
    submit();
    await flush();
    const post = calls.find((c) => c.method === 'POST');
    expect(post?.body).toEqual({ start: '2030-05-20', guests: 3, slot: '15:00', name: 'Ada Lovelace', email: 'ada@example.com' });
  });

  it('product: quantity selector, availability for today, no calendar', async () => {
    const product: CatalogItem = { ...room, type: 'PRODUCT', slug: 'honey', capacity: 5, price_cents: 800, cta_mode: 'request' };
    const { api, calls } = fakeApi(availabilityFor(800));
    mountItems(host, [product], api, 'en', 'en');
    await open();
    expect(root().querySelector('.cal')).toBeNull();
    expect(calls[0]?.path).toBe(`/items/honey/availability?from=${TODAY}&to=2030-05-11&guests=1`);
    expect(q('.est[role=status]').textContent).toContain('8.00');
    fillCustomer();
    submit();
    await flush();
    expect(calls.find((c) => c.method === 'POST')?.body).toMatchObject({ start: TODAY, guests: 1 });
  });
});
