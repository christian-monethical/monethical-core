import { fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { store } from '../src/api/cache';
import SitesPage from '../src/features/sites/SitesPage';

interface SiteFixture {
  site_id: string;
  name: string;
  site_key: string;
  domains: string[];
  status: 'active' | 'paused';
  created_at: string;
  updated_at: string;
}

const site = (id: string, name: string, domains: string[]): SiteFixture => ({
  site_id: id,
  name,
  site_key: `pk_live_${id}`,
  domains,
  status: 'active',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
});

const me = { tenant_id: 't', email: 'a@b.it', is_staff: false, plan: 'PRO', plan_name: 'Business', max_sites: 5, stripe_connected: false, stripe_charges_enabled: false };
const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('sites list and create flow', () => {
  let sites: SiteFixture[];
  let calls: { method: string; url: string; body: unknown }[];

  beforeEach(() => {
    store.clear();
    sites = [site('S1', 'Villa Aurora', ['www.villa.it'])];
    calls = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: Request) => {
        const url = new URL(input.url);
        const text = await input.clone().text();
        calls.push({ method: input.method, url: url.pathname, body: text ? JSON.parse(text) : undefined });
        if (url.pathname === '/api/v1/me') return json(me);
        if (url.pathname === '/api/v1/sites' && input.method === 'GET') return json(sites);
        if (url.pathname === '/api/v1/sites' && input.method === 'POST') {
          const payload = JSON.parse(text) as { name: string; domains: string[] };
          if (payload.domains.includes('taken.example.com')) {
            return json({ error: { code: 'domain_taken', message: 'A domain is already registered on another site' } }, 409);
          }
          const created = site('S2', payload.name, payload.domains);
          sites = [...sites, created];
          return json(created);
        }
        return json({ error: { code: 'not_found', message: 'nope' } }, 404);
      }),
    );
    window.history.replaceState(null, '', '/sites');
  });
  afterEach(() => vi.unstubAllGlobals());

  it('lists the sites with plan usage', async () => {
    render(<SitesPage />);
    expect(await screen.findByText('Villa Aurora')).toBeTruthy();
    expect(screen.getByText('www.villa.it')).toBeTruthy();
    await waitFor(() => expect(screen.getByText(/1 di 5 siti/)).toBeTruthy());
  });

  it('shows the empty state when there are no sites', async () => {
    sites = [];
    render(<SitesPage />);
    expect(await screen.findByText('Nessun sito')).toBeTruthy();
  });

  it('creates a site with normalized domains and refreshes the list', async () => {
    render(<SitesPage />);
    await screen.findByText('Villa Aurora');
    fireEvent.click(screen.getAllByRole('button', { name: 'Nuovo sito' })[0] as HTMLElement);

    const dialog = await screen.findByRole('dialog', { name: 'Nuovo sito' });
    fireEvent.input(screen.getByLabelText(/Nome del sito/), { target: { value: 'Studio Rossi' } });
    const domains = screen.getByLabelText('Domini');
    fireEvent.input(domains, { target: { value: 'https://WWW.Rossi.it/contatti' } });
    fireEvent.keyDown(domains, { key: 'Enter' });
    fireEvent.click(screen.getByRole('button', { name: 'Crea sito' }));

    await waitFor(() => expect(calls.some((c) => c.method === 'POST')).toBe(true));
    const post = calls.find((c) => c.method === 'POST');
    expect(post?.body).toEqual({ name: 'Studio Rossi', domains: ['www.rossi.it'] });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(dialog.isConnected).toBe(false);
    expect(window.location.pathname).toBe('/sites/S2');
  });

  it('validates required fields client-side before calling the API', async () => {
    render(<SitesPage />);
    await screen.findByText('Villa Aurora');
    fireEvent.click(screen.getAllByRole('button', { name: 'Nuovo sito' })[0] as HTMLElement);
    await screen.findByRole('dialog');
    fireEvent.click(screen.getByRole('button', { name: 'Crea sito' }));
    expect((await screen.findAllByRole('alert')).length).toBeGreaterThan(0);
    expect(calls.some((c) => c.method === 'POST')).toBe(false);
  });

  it('surfaces the server error for a taken domain inside the dialog', async () => {
    render(<SitesPage />);
    await screen.findByText('Villa Aurora');
    fireEvent.click(screen.getAllByRole('button', { name: 'Nuovo sito' })[0] as HTMLElement);
    await screen.findByRole('dialog');
    fireEvent.input(screen.getByLabelText(/Nome del sito/), { target: { value: 'Clone' } });
    const domains = screen.getByLabelText('Domini');
    fireEvent.input(domains, { target: { value: 'taken.example.com' } });
    fireEvent.keyDown(domains, { key: 'Enter' });
    fireEvent.click(screen.getByRole('button', { name: 'Crea sito' }));
    expect(await screen.findByText(/già registrato su un altro sito/)).toBeTruthy();
    expect(screen.getByRole('dialog')).toBeTruthy();
  });
});
