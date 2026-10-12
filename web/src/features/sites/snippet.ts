export interface SnippetRefs {
  forms: { form_id: string; name: string }[];
  surveys: { survey_id: string; title: string }[];
  items: { slug: string; name: string }[];
}

export interface Snippet {
  id: string;
  label: string;
  code: string;
}

/** Escape characters that must not appear raw inside an attribute value we generate. */
const attr = (v: string): string => v.replace(/[&"<>]/g, (c) => `&#${c.charCodeAt(0)};`);

/** Loader script (one per page). The loader reads `/config/<key>/site.json` from its own origin. */
export function scriptTag(edgeUrl: string, siteKey: string): string {
  return `<script async src="${attr(edgeUrl)}/w/loader.js" data-site-key="${attr(siteKey)}"></script>`;
}

/** Placeholder the loader mounts a widget into (contract: widgets/src/loader.ts). */
const container = (widget: string, attrs = ''): string => `<div data-monethical-widget="${widget}"${attrs}></div>`;

/** Per-module containers. The banner needs none: the loader shows it from the site config. */
export function containerSnippets(refs: SnippetRefs): Snippet[] {
  return [
    ...refs.forms.map((f) => ({
      id: `form-${f.form_id}`,
      label: `Form: ${f.name}`,
      code: container('contact-form', ` data-form-id="${attr(f.form_id)}"`),
    })),
    { id: 'newsletter', label: 'Newsletter', code: container('newsletter') },
    ...refs.surveys.map((s) => ({
      id: `survey-${s.survey_id}`,
      label: `Survey: ${s.title}`,
      code: container('survey', ` data-id="${attr(s.survey_id)}"`),
    })),
    { id: 'items', label: 'Catalog (all items)', code: container('items') },
    ...refs.items.map((i) => ({
      id: `item-${i.slug}`,
      label: `Catalog: ${i.name}`,
      code: container('items', ` data-slug="${attr(i.slug)}"`),
    })),
  ];
}
