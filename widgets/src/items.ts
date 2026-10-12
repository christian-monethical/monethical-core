/** Catalog / booking widget (`data-monethical-widget="items"`). */
import { ApiError, apiFor, type Api } from './api';
import { clear, emit, h, mountShadow, safeUrl, uid, type Shadow } from './dom';
import { applyTokens } from './tokens';
import { pageLang, type Dict, type Lang } from './i18n';
import {
  MAX_NIGHTS,
  addDays,
  addMonths,
  checkRange,
  eachNight,
  estimate,
  formatDate,
  formatMoney,
  guestBounds,
  monthCells,
  monthStart,
  monthsBetween,
  nightsBetween,
  safeLocale,
  todayIso,
  type RangeProblem,
} from './items-logic';
import type { BookOut, Boot, CatalogItem, DayAvailability, SiteDoc } from './types';
import { BASE_CSS, describeError, fieldBox, honeypot, setBusy, showStatus, statusRegion } from './ui';
import { PHONE_RE, errText } from './fields';
import { validateEmail } from './validate';

type K =
  | 'from' | 'night' | 'person' | 'request' | 'book' | 'pay' | 'close' | 'guests' | 'quantity' | 'time'
  | 'name' | 'email' | 'phone' | 'notes' | 'pick_dates' | 'pick_day' | 'prev' | 'next' | 'loading'
  | 'estimate' | 'estimate_note' | 'nights' | 'unavail' | 'na' | 'min_stay' | 'checkin' | 'checkout'
  | 'thanks_request' | 'thanks_book' | 'amenities';

const T: Dict<K> = {
  it: {
    from: 'Da', night: '/ notte', person: '/ persona', request: 'Richiedi', book: 'Prenota', pay: 'Prenota e paga',
    close: 'Chiudi', guests: 'Ospiti', quantity: 'Quantità', time: 'Orario', name: 'Nome e cognome', email: 'Email',
    phone: 'Telefono (facoltativo)', notes: 'Note (facoltative)', pick_dates: 'Seleziona le date', pick_day: 'Seleziona un giorno',
    prev: 'Mese precedente', next: 'Mese successivo', loading: 'Caricamento disponibilità…', estimate: 'Totale stimato',
    estimate_note: 'Stima indicativa: il prezzo finale è confermato alla prenotazione.', nights: 'notti',
    unavail: 'Le date selezionate non sono disponibili. Scegline altre.', na: 'non disponibile', min_stay: 'Soggiorno minimo (notti):',
    checkin: 'Arrivo', checkout: 'Partenza', thanks_request: 'Richiesta inviata. Ti contatteremo a breve.',
    thanks_book: 'Prenotazione confermata. Grazie!', amenities: 'Servizi',
  },
  en: {
    from: 'From', night: '/ night', person: '/ person', request: 'Request', book: 'Book now', pay: 'Book and pay',
    close: 'Close', guests: 'Guests', quantity: 'Quantity', time: 'Time', name: 'Full name', email: 'Email',
    phone: 'Phone (optional)', notes: 'Notes (optional)', pick_dates: 'Select your dates', pick_day: 'Select a day',
    prev: 'Previous month', next: 'Next month', loading: 'Loading availability…', estimate: 'Estimated total',
    estimate_note: 'Estimate only: the final price is confirmed when you book.', nights: 'nights',
    unavail: 'Those dates are not available. Please choose others.', na: 'not available', min_stay: 'Minimum stay (nights):',
    checkin: 'Check-in', checkout: 'Check-out', thanks_request: 'Request sent. We will contact you shortly.',
    thanks_book: 'Booking confirmed. Thank you!', amenities: 'Amenities',
  },
  de: {
    from: 'Ab', night: '/ Nacht', person: '/ Person', request: 'Anfragen', book: 'Jetzt buchen', pay: 'Buchen und bezahlen',
    close: 'Schließen', guests: 'Gäste', quantity: 'Menge', time: 'Uhrzeit', name: 'Vollständiger Name', email: 'E-Mail',
    phone: 'Telefon (optional)', notes: 'Hinweise (optional)', pick_dates: 'Daten auswählen', pick_day: 'Tag auswählen',
    prev: 'Voriger Monat', next: 'Nächster Monat', loading: 'Verfügbarkeit wird geladen…', estimate: 'Geschätzte Summe',
    estimate_note: 'Nur eine Schätzung: der Endpreis wird bei der Buchung bestätigt.', nights: 'Nächte',
    unavail: 'Diese Daten sind nicht verfügbar. Bitte andere wählen.', na: 'nicht verfügbar', min_stay: 'Mindestaufenthalt (Nächte):',
    checkin: 'Anreise', checkout: 'Abreise', thanks_request: 'Anfrage gesendet. Wir melden uns in Kürze.',
    thanks_book: 'Buchung bestätigt. Danke!', amenities: 'Ausstattung',
  },
  fr: {
    from: 'À partir de', night: '/ nuit', person: '/ personne', request: 'Demander', book: 'Réserver', pay: 'Réserver et payer',
    close: 'Fermer', guests: 'Voyageurs', quantity: 'Quantité', time: 'Heure', name: 'Nom complet', email: 'E-mail',
    phone: 'Téléphone (facultatif)', notes: 'Notes (facultatif)', pick_dates: 'Choisissez vos dates', pick_day: 'Choisissez un jour',
    prev: 'Mois précédent', next: 'Mois suivant', loading: 'Chargement des disponibilités…', estimate: 'Total estimé',
    estimate_note: "Estimation : le prix final est confirmé à la réservation.", nights: 'nuits',
    unavail: "Ces dates ne sont pas disponibles. Veuillez en choisir d'autres.", na: 'indisponible', min_stay: 'Séjour minimum (nuits) :',
    checkin: 'Arrivée', checkout: 'Départ', thanks_request: 'Demande envoyée. Nous vous contacterons rapidement.',
    thanks_book: 'Réservation confirmée. Merci !', amenities: 'Équipements',
  },
  es: {
    from: 'Desde', night: '/ noche', person: '/ persona', request: 'Solicitar', book: 'Reservar', pay: 'Reservar y pagar',
    close: 'Cerrar', guests: 'Huéspedes', quantity: 'Cantidad', time: 'Hora', name: 'Nombre completo', email: 'Correo electrónico',
    phone: 'Teléfono (opcional)', notes: 'Notas (opcional)', pick_dates: 'Selecciona las fechas', pick_day: 'Selecciona un día',
    prev: 'Mes anterior', next: 'Mes siguiente', loading: 'Cargando disponibilidad…', estimate: 'Total estimado',
    estimate_note: 'Solo una estimación: el precio final se confirma al reservar.', nights: 'noches',
    unavail: 'Esas fechas no están disponibles. Elige otras.', na: 'no disponible', min_stay: 'Estancia mínima (noches):',
    checkin: 'Llegada', checkout: 'Salida', thanks_request: 'Solicitud enviada. Te contactaremos en breve.',
    thanks_book: 'Reserva confirmada. ¡Gracias!', amenities: 'Servicios',
  },
};

const CSS = `
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:20px;font:15px/1.5 var(--font)}
.card{display:flex;flex-direction:column;background:var(--bg);color:var(--tx);border:1px solid var(--bd);border-radius:var(--r);box-shadow:var(--sh);overflow:hidden;font-family:var(--font)}
.card img{display:block;width:100%;aspect-ratio:4/3;object-fit:cover;background:var(--bd)}
.cb{display:flex;flex-direction:column;gap:6px;padding:var(--pad);flex:1}
.cb h3{margin:0;font-size:1.1em}
.cb p{margin:0;color:var(--mu);display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
.cb .price{color:var(--tx);font-weight:600;margin-top:auto;padding-top:6px}
dialog{padding:0;border:1px solid var(--bd);border-radius:var(--r);background:var(--bg);color:var(--tx);font:15px/1.5 var(--font);width:min(760px,calc(100% - 24px));max-height:calc(100% - 24px);box-shadow:var(--sh)}
dialog::backdrop{background:rgba(0,0,0,.55)}
.dl{padding:var(--pad);position:relative}
.dl h2{margin:0 36px 6px 0;font-size:1.35em}
.x{position:absolute;top:10px;right:10px;width:36px;height:36px;border-radius:50%;border:1px solid var(--bd);background:var(--bg);color:var(--tx);font-size:20px;line-height:1;cursor:pointer;padding:0}
.gal{margin:0 0 12px}
.gal>img{display:block;width:100%;max-height:320px;aspect-ratio:16/10;object-fit:cover;border-radius:var(--r2);background:var(--bd)}
.th{display:flex;gap:6px;margin-top:6px;overflow-x:auto}
.th button{border:1px solid var(--bd);padding:0;border-radius:6px;overflow:hidden;cursor:pointer;background:none;flex:none}
.th img{display:block;width:64px;height:48px;object-fit:cover}
.am{display:flex;flex-wrap:wrap;gap:6px;margin:8px 0;padding:0;list-style:none}
.am li{border:1px solid var(--bd);border-radius:99px;padding:2px 10px;font-size:.85em;color:var(--mu)}
.two{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.cal{border:1px solid var(--bd);border-radius:var(--r2);padding:10px;margin:0 0 14px}
.ch{display:flex;align-items:center;justify-content:space-between;margin:0 0 6px;font-weight:600;text-transform:capitalize}
.ch button{width:40px;height:40px;border:1px solid var(--bd);border-radius:50%;background:var(--bg);color:var(--tx);cursor:pointer;font-size:18px;padding:0}
.ch button[disabled]{opacity:.4;cursor:not-allowed}
.cg{display:grid;grid-template-columns:repeat(7,1fr);gap:2px;text-align:center}
.wd{font-size:.75em;color:var(--mu);padding:4px 0}
.d{height:40px;border:0;border-radius:8px;background:transparent;color:var(--tx);font:inherit;cursor:pointer;padding:0}
.d:hover{background:var(--bd)}
.d[aria-disabled=true]{color:var(--mu);opacity:.45;cursor:not-allowed;text-decoration:line-through}
.d[aria-disabled=true]:hover{background:transparent}
.d.rng{background:var(--bd);border-radius:0}
.d[aria-pressed=true]{background:var(--ac);color:var(--at);opacity:1;text-decoration:none}
.d:focus-visible{outline:2px solid var(--fc);outline-offset:1px}
.est{margin:0 0 12px;font-weight:600}
.est small{display:block;font-weight:400;color:var(--mu)}
.ok h2{margin-right:0}
@media (max-width:520px){.two{grid-template-columns:1fr}}
`;

interface Env {
  api: Api;
  lang: Lang;
  locale: string;
  t: Record<K, string>;
}

function ctaLabel(item: CatalogItem, t: Record<K, string>): string {
  return item.button_text || t[item.cta_mode];
}

function priceLabel(item: CatalogItem, env: Env): string {
  const unit = item.type === 'ROOM' ? env.t.night : item.type === 'EXPERIENCE' ? env.t.person : '';
  return `${env.t.from} ${formatMoney(item.price_cents, env.locale)} ${unit}`.trim();
}

function image(src: string, alt: string, lazy = true): HTMLImageElement {
  return h('img', { src, alt, loading: lazy ? 'lazy' : null, decoding: 'async', referrerpolicy: 'no-referrer' });
}

function gallery(item: CatalogItem): HTMLElement | null {
  const urls = [...new Set([item.image_url, ...item.gallery].map(safeUrl).filter((u): u is string => u !== null))];
  const first = urls[0];
  if (!first) return null;
  const main = image(first, item.name, false);
  const thumbs =
    urls.length > 1
      ? h(
          'div',
          { class: 'th' },
          ...urls.map((u, i) =>
            h('button', { type: 'button', 'aria-label': `${i + 1}/${urls.length}`, click: () => { main.src = u; } }, image(u, '')),
          ),
        )
      : null;
  return h('div', { class: 'gal' }, main, thumbs);
}

interface Selection {
  guests: number;
  slot: string | null;
  start: string | null;
  end: string | null;
  month: string;
  epoch: number;
}

function problemText(p: RangeProblem, item: CatalogItem, t: Record<K, string>): string {
  if (p === 'min_stay') return `${t.min_stay} ${item.min_nights}`;
  if (p === 'unavailable') return t.unavail;
  return p === 'max_stay' ? `${t.min_stay} ≤ ${MAX_NIGHTS}` : t.pick_dates;
}

function detailDialog(item: CatalogItem, env: Env): HTMLDialogElement {
  const { api, lang, locale, t } = env;
  const id = uid();
  const isRoom = item.type === 'ROOM';
  const isProduct = item.type === 'PRODUCT';
  const bounds = guestBounds(item);
  const today = todayIso();
  const first = item.available_from && item.available_from > today ? item.available_from : today;
  const sel: Selection = { guests: bounds.min, slot: item.slots[0] ?? null, start: null, end: null, month: monthStart(first), epoch: 0 };
  const avail = new Map<string, DayAvailability>();
  const loading = new Map<string, Promise<void>>();
  let productDay: DayAvailability | null = null;

  const status = statusRegion();
  const summary = h('div', { class: 'est', role: 'status', 'aria-live': 'polite' });
  const cal = h('div', { class: 'cal' });
  const money = (cents: number): string => formatMoney(cents, locale);

  // ---- availability
  const query = (from: string, to: string): string =>
    `/items/${encodeURIComponent(item.slug)}/availability?from=${from}&to=${to}&guests=${sel.guests}${sel.slot ? `&slot=${encodeURIComponent(sel.slot)}` : ''}`;

  const fail = (err: unknown): void => { showStatus(status, describeError(err, lang), true); };

  function loadMonth(month: string): Promise<void> {
    const cached = loading.get(month);
    if (cached) return cached;
    const from = month < today ? today : month;
    const to = addMonths(month, 1);
    if (from >= to) return Promise.resolve();
    const epoch = sel.epoch;
    const p = api.get<DayAvailability[]>(query(from, to)).then((days) => {
      if (epoch !== sel.epoch) return;
      for (const d of days) avail.set(d.day, d);
      update();
    });
    loading.set(month, p);
    p.catch(() => { loading.delete(month); });
    return p;
  }

  function loadProduct(): void {
    const epoch = sel.epoch;
    api.get<DayAvailability[]>(query(today, addDays(today, 1))).then((days) => {
      if (epoch !== sel.epoch) return;
      productDay = days[0] ?? null;
      update();
    }).catch(fail);
  }

  function reset(): void {
    sel.epoch += 1;
    sel.start = null;
    sel.end = null;
    avail.clear();
    loading.clear();
    productDay = null;
    if (isProduct) loadProduct();
    else loadMonth(sel.month).catch(fail);
    update();
  }

  // ---- calendar
  async function pick(iso: string): Promise<void> {
    showStatus(status, '', false);
    try {
      if (isRoom && sel.start && !sel.end && iso > sel.start) {
        await Promise.all(monthsBetween(sel.start, iso).map(loadMonth));
        const problem = checkRange(item, avail, sel.start, iso);
        if (problem) return void showStatus(status, problemText(problem, item, t), true);
        sel.end = iso;
      } else {
        if (avail.get(iso)?.available !== true) return;
        sel.start = iso;
        sel.end = null;
      }
    } catch (err) {
      return fail(err);
    } finally {
      update();
    }
  }

  /** Roving tabindex: the selected start when visible, else the first day of the month. */
  function tabStop(): string {
    return sel.start?.slice(0, 7) === sel.month.slice(0, 7) ? sel.start : sel.month;
  }

  function dayButton(iso: string): HTMLButtonElement {
    const a = avail.get(iso);
    const choosingEnd = isRoom && sel.start !== null && sel.end === null && iso > sel.start;
    const usable = iso >= today && (a?.available === true || choosingEnd);
    const selected = iso === sel.start || iso === sel.end;
    const inRange = isRoom && sel.start !== null && sel.end !== null && iso > sel.start && iso < sel.end;
    const label = `${formatDate(iso, locale)}${a && !a.available ? `, ${t.na}` : ''}`;
    return h('button', {
      type: 'button',
      class: `d${inRange ? ' rng' : ''}`,
      'data-day': iso,
      'aria-label': label,
      'aria-pressed': selected ? 'true' : 'false',
      'aria-disabled': usable ? null : 'true',
      tabindex: iso === tabStop() ? '0' : '-1',
      click: () => { if (usable) void pick(iso); },
    }, String(Number(iso.slice(8))));
  }

  function renderCalendar(): void {
    const fmt = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' });
    const wd = new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' });
    const monday = '2024-01-01';
    const atStart = sel.month <= monthStart(first);
    const atEnd = Boolean(item.available_to) && addMonths(sel.month, 1) > (item.available_to ?? '');
    const nav = (delta: number, label: string, glyph: string, disabled: boolean): HTMLButtonElement =>
      h('button', {
        type: 'button', 'aria-label': label, disabled,
        click: () => { sel.month = addMonths(sel.month, delta); loadMonth(sel.month).catch(fail); update(); },
      }, glyph);
    const days = monthCells(sel.month).map((d) => (d ? dayButton(d) : h('span')));
    const grid = h(
      'div',
      { class: 'cg', role: 'group', 'aria-label': fmt.format(new Date(`${sel.month}T00:00:00Z`)), 'aria-busy': loading.has(sel.month) && !avail.size ? 'true' : null },
      ...Array.from({ length: 7 }, (_, i) => h('span', { class: 'wd', 'aria-hidden': 'true' }, wd.format(new Date(`${addDays(monday, i)}T00:00:00Z`)))),
      ...days,
    );
    grid.addEventListener('keydown', (ev) => {
      const e = ev;
      const step: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
      const delta = step[e.key];
      const cur = (e.target as HTMLElement).dataset.day;
      if (delta === undefined || !cur) return;
      e.preventDefault();
      const target = addDays(cur, delta);
      const next = grid.querySelector<HTMLButtonElement>(`[data-day="${target}"]`);
      grid.querySelectorAll('[data-day]').forEach((b) => { b.setAttribute('tabindex', '-1'); });
      next?.setAttribute('tabindex', '0');
      next?.focus();
    });
    cal.replaceChildren(
      h('div', { class: 'ch' }, nav(-1, t.prev, '‹', atStart), h('span', { 'aria-live': 'polite' }, fmt.format(new Date(`${sel.month}T00:00:00Z`))), nav(1, t.next, '›', atEnd)),
      grid,
    );
  }

  function renderSummary(): void {
    clear(summary);
    let days: Pick<DayAvailability, 'price_cents'>[] = [];
    let lead = isProduct ? '' : isRoom ? t.pick_dates : t.pick_day;
    if (isRoom && sel.start && sel.end) {
      days = eachNight(sel.start, sel.end).map((n) => avail.get(n)).filter((d): d is DayAvailability => d !== undefined);
      lead = `${formatDate(sel.start, locale)} → ${formatDate(sel.end, locale)} (${nightsBetween(sel.start, sel.end)} ${t.nights})`;
    } else if (!isRoom && !isProduct && sel.start) {
      const d = avail.get(sel.start);
      days = d ? [d] : [];
      lead = formatDate(sel.start, locale);
    } else if (isProduct && productDay?.available) {
      days = [productDay];
    } else if (isProduct && productDay) {
      lead = t.unavail;
    }
    const complete = days.length > 0;
    summary.append(lead);
    if (complete) {
      summary.append(` · ${t.estimate}: ${money(estimate(item, days, sel.guests))}`, h('small', null, t.estimate_note));
    }
  }

  function update(): void {
    if (!isProduct) renderCalendar();
    renderSummary();
  }

  // ---- form
  const clamp = (v: number): number => Math.min(bounds.max, Math.max(bounds.min, Number.isFinite(v) ? Math.round(v) : bounds.min));
  const guests = h('input', { type: 'number', name: 'guests', min: bounds.min, max: bounds.max, value: sel.guests, inputmode: 'numeric' });
  guests.addEventListener('change', () => {
    sel.guests = clamp(Number(guests.value));
    guests.value = String(sel.guests);
    reset();
  });
  const guestsBox = fieldBox(`${id}-g`, isProduct ? t.quantity : t.guests, guests, true);
  const slot = item.slots.length ? h('select', { name: 'slot' }, ...item.slots.map((s) => h('option', { value: s }, s))) : null;
  slot?.addEventListener('change', () => { sel.slot = slot.value; reset(); });
  const slotBox = slot && fieldBox(`${id}-s`, t.time, slot, true);
  const name = h('input', { type: 'text', name: 'name', autocomplete: 'name', maxlength: 120 });
  const email = h('input', { type: 'email', name: 'email', autocomplete: 'email', maxlength: 254 });
  const phone = h('input', { type: 'tel', name: 'phone', autocomplete: 'tel', maxlength: 50 });
  const notes = h('textarea', { name: 'notes', maxlength: 2000, rows: 3 });
  const nameBox = fieldBox(`${id}-n`, t.name, name, true);
  const emailBox = fieldBox(`${id}-m`, t.email, email, true);
  const phoneBox = fieldBox(`${id}-p`, t.phone, phone, false);
  const notesBox = fieldBox(`${id}-o`, t.notes, notes, false);
  const trap = honeypot();
  const submit = h('button', { type: 'submit', class: 'btn' }, ctaLabel(item, t));
  const form = h(
    'form',
    { novalidate: true },
    h('div', { class: 'two' }, guestsBox.el, slotBox?.el),
    !isProduct && h('p', { class: 'mu' }, isRoom ? `${t.checkin} → ${t.checkout}` : t.pick_day),
    !isProduct && cal,
    summary,
    h('div', { class: 'two' }, nameBox.el, emailBox.el),
    phoneBox.el,
    notesBox.el,
    trap.el,
    submit,
    status,
  );

  const validate = (): HTMLElement | null => {
    const checks: [HTMLElement, () => string | null][] = [
      [guests, () => (Number(guests.value) >= bounds.min && Number(guests.value) <= bounds.max ? null : errText(lang, 'invalid'))],
      [name, () => (name.value.trim().length >= 2 ? null : errText(lang, 'required'))],
      [email, () => { const c = validateEmail(email.value); return c && errText(lang, c); }],
      [phone, () => (!phone.value.trim() || PHONE_RE.test(phone.value.trim()) ? null : errText(lang, 'invalid_phone'))],
    ];
    const boxes = [guestsBox, nameBox, emailBox, phoneBox];
    let firstBad: HTMLElement | null = null;
    checks.forEach(([el, fn], i) => {
      const msg = fn();
      boxes[i]?.setError(msg);
      if (msg) firstBad ??= el;
    });
    return firstBad;
  };

  const confirmation = (res: BookOut): void => {
    const b = res.booking;
    const message = b.status === 'CONFIRMED' || b.status === 'PAID' ? t.thanks_book : t.thanks_request;
    const ok = h(
      'div',
      { class: 'ok', role: 'status', tabindex: '-1' },
      h('h2', null, message),
      h('p', null, `${b.item_name} · ${formatDate(b.start, locale)}${isRoom ? ` → ${formatDate(b.end, locale)}` : ''} · ${money(b.total_cents)}`),
    );
    form.replaceChildren(ok);
    ok.focus();
    emit('monethical:booking', { item: item.slug, booking_id: b.booking_id, status: b.status });
  };

  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    if (submit.disabled) return;
    showStatus(status, '', false);
    const bad = validate();
    const start = isProduct ? today : sel.start;
    const missingDates = !start || (isRoom && !sel.end);
    if (missingDates) showStatus(status, isRoom ? t.pick_dates : t.pick_day, true);
    if (bad || !start || missingDates) return (bad ?? cal).focus();
    if (isProduct && productDay?.available === false) return showStatus(status, t.unavail, true);
    const body: Record<string, unknown> = {
      start,
      guests: sel.guests,
      name: name.value.trim(),
      email: email.value.trim(),
    };
    if (isRoom) body.end = sel.end;
    if (sel.slot) body.slot = sel.slot;
    if (phone.value.trim()) body.phone = phone.value.trim();
    if (notes.value.trim()) body.notes = notes.value.trim();
    if (item.cta_mode === 'pay' && location.protocol === 'https:') {
      const here = location.href.split('#')[0] ?? '';
      body.return_url = here.length <= 500 ? here : `${location.origin}${location.pathname}`;
    }
    if (trap.input.value) return; // bot: send nothing
    setBusy(submit, true);
    api
      .post<BookOut>(`/items/${encodeURIComponent(item.slug)}/book`, body)
      .then((res) => {
        const url = safeUrl(res.checkout_url);
        if (url) location.assign(url);
        else confirmation(res);
      })
      .catch((err: unknown) => {
        setBusy(submit, false);
        if (err instanceof ApiError && err.code === 'not_available') {
          showStatus(status, t.unavail, true);
          reset();
        } else {
          fail(err);
        }
      });
  });

  const gal = gallery(item);
  const dlg = h('dialog', { 'aria-labelledby': `${id}-t` });
  applyTokens(dlg, item.surface);
  const close = h('button', { type: 'button', class: 'x', 'aria-label': t.close, click: () => { dlg.close(); } }, '×');
  dlg.append(
    h(
      'div',
      { class: 'dl' },
      close,
      gal,
      h('h2', { id: `${id}-t` }, item.name),
      item.description && h('p', { class: 'mu' }, item.description),
      item.amenities.length > 0 && h('ul', { class: 'am', 'aria-label': t.amenities }, ...item.amenities.map((a) => h('li', null, a))),
      h('p', { class: 'est' }, priceLabel(item, env)),
      form,
    ),
  );
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
  dlg.addEventListener('close', () => { dlg.remove(); });
  update();
  if (isProduct) loadProduct();
  else loadMonth(sel.month).catch(fail);
  return dlg;
}

/** Render the card grid into `parent`; used by the loader and by the console preview. */
export function mountItems(parent: Node, items: CatalogItem[], api: Api, lang: Lang, locale = safeLocale(document.documentElement.lang)): Shadow {
  const shadow = mountShadow(parent, BASE_CSS + CSS);
  const env: Env = { api, lang, locale, t: T[lang] };
  const cards = items.map((item) => {
    const img = safeUrl(item.image_url);
    const open = h('button', { type: 'button', class: 'btn' }, ctaLabel(item, env.t));
    const card = h(
      'article',
      { class: 'card' },
      img && image(img, item.name),
      h('div', { class: 'cb' }, h('h3', null, item.name), item.description && h('p', null, item.description), h('div', { class: 'price' }, priceLabel(item, env)), open),
    );
    applyTokens(card, item.surface);
    open.addEventListener('click', () => {
      const dlg = detailDialog(item, env);
      shadow.root.appendChild(dlg);
      if (typeof dlg.showModal === 'function') dlg.showModal();
      else dlg.setAttribute('open', '');
      dlg.addEventListener('close', () => { open.focus(); });
    });
    return card;
  });
  shadow.root.appendChild(h('div', { class: 'grid' }, ...cards));
  return shadow;
}

export function mount(el: HTMLElement, doc: SiteDoc, boot: Boot): void {
  const slug = el.dataset.slug;
  const items = doc.catalog.filter((i) => i.active && (!slug || i.slug === slug));
  if (items.length) mountItems(el, items, apiFor(boot), pageLang(doc.banner?.language));
}
