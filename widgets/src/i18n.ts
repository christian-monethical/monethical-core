export const LANGS = ['it', 'en', 'de', 'fr', 'es'] as const;
export type Lang = (typeof LANGS)[number];
export type Dict<K extends string> = Record<Lang, Record<K, string>>;

/** First candidate whose primary subtag is supported; English otherwise. */
export function pickLang(...candidates: (string | undefined | null)[]): Lang {
  for (const c of candidates) {
    const code = c?.slice(0, 2).toLowerCase();
    const found = LANGS.find((l) => l === code);
    if (found) return found;
  }
  return 'en';
}

/** UI language: the page's `lang` attribute first, then the configuration's language. */
export function pageLang(configLang?: string): Lang {
  return pickLang(document.documentElement.lang, configLang);
}

/** Transport and common validation messages shared by every form-like widget. */
export type ErrKey = 'required' | 'invalid_email' | 'generic' | 'rate' | 'network' | 'privacy';

export const ERR: Dict<ErrKey> = {
  it: {
    required: 'Campo obbligatorio',
    invalid_email: 'Inserisci un indirizzo e-mail valido',
    generic: 'Qualcosa è andato storto. Riprova.',
    rate: 'Troppe richieste. Attendi un minuto e riprova.',
    network: 'Connessione non riuscita. Riprova.',
    privacy: 'Informativa privacy',
  },
  en: {
    required: 'This field is required',
    invalid_email: 'Enter a valid email address',
    generic: 'Something went wrong. Please try again.',
    rate: 'Too many requests. Please wait a minute and retry.',
    network: 'Connection failed. Please try again.',
    privacy: 'Privacy policy',
  },
  de: {
    required: 'Pflichtfeld',
    invalid_email: 'Bitte eine gültige E-Mail-Adresse eingeben',
    generic: 'Etwas ist schiefgelaufen. Bitte erneut versuchen.',
    rate: 'Zu viele Anfragen. Bitte eine Minute warten.',
    network: 'Verbindung fehlgeschlagen. Bitte erneut versuchen.',
    privacy: 'Datenschutzerklärung',
  },
  fr: {
    required: 'Champ obligatoire',
    invalid_email: 'Saisissez une adresse e-mail valide',
    generic: "Une erreur s'est produite. Veuillez réessayer.",
    rate: 'Trop de requêtes. Patientez une minute.',
    network: 'Connexion impossible. Veuillez réessayer.',
    privacy: 'Politique de confidentialité',
  },
  es: {
    required: 'Campo obligatorio',
    invalid_email: 'Introduce un correo electrónico válido',
    generic: 'Algo salió mal. Inténtalo de nuevo.',
    rate: 'Demasiadas solicitudes. Espera un minuto.',
    network: 'Error de conexión. Inténtalo de nuevo.',
    privacy: 'Política de privacidad',
  },
};
