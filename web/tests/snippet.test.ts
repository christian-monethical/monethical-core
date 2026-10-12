import { describe, expect, it } from 'vitest';
import { containerSnippets, scriptTag } from '../src/features/sites/snippet';

describe('embed snippet generator', () => {
  it('builds the loader tag with the public key', () => {
    expect(scriptTag('https://edge.example.com', 'pk_live_abc')).toBe(
      '<script async src="https://edge.example.com/w/loader.js" data-site-key="pk_live_abc"></script>',
    );
  });

  it('escapes attribute values', () => {
    expect(scriptTag('https://e.test', 'a"><script>')).not.toContain('"><script>');
  });

  it('emits one container per module following the widgets loader contract', () => {
    const codes = containerSnippets({
      forms: [{ form_id: 'F1', name: 'Contatti' }],
      surveys: [{ survey_id: 'S1', title: 'NPS' }],
      items: [{ slug: 'suite', name: 'Suite' }],
    }).map((s) => s.code);
    expect(codes).toContain('<div data-monethical-widget="contact-form" data-form-id="F1"></div>');
    expect(codes).toContain('<div data-monethical-widget="newsletter"></div>');
    expect(codes).toContain('<div data-monethical-widget="survey" data-id="S1"></div>');
    expect(codes).toContain('<div data-monethical-widget="items"></div>');
    expect(codes).toContain('<div data-monethical-widget="items" data-slug="suite"></div>');
  });
});
