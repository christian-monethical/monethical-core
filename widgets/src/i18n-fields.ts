import type { Dict } from './i18n';

export type FieldErrKey = 'invalid_phone' | 'too_long' | 'invalid_option' | 'invalid';

export const ERR_FIELD: Dict<FieldErrKey> = {
  it: {
    invalid_phone: 'Inserisci un numero di telefono valido',
    too_long: 'Testo troppo lungo',
    invalid_option: 'Seleziona un valore valido',
    invalid: 'Valore non valido',
  },
  en: {
    invalid_phone: 'Enter a valid phone number',
    too_long: 'Text is too long',
    invalid_option: 'Choose a valid option',
    invalid: 'Invalid value',
  },
  de: {
    invalid_phone: 'Bitte eine gültige Telefonnummer eingeben',
    too_long: 'Text ist zu lang',
    invalid_option: 'Bitte eine gültige Option wählen',
    invalid: 'Ungültiger Wert',
  },
  fr: {
    invalid_phone: 'Saisissez un numéro de téléphone valide',
    too_long: 'Texte trop long',
    invalid_option: 'Choisissez une option valide',
    invalid: 'Valeur invalide',
  },
  es: {
    invalid_phone: 'Introduce un teléfono válido',
    too_long: 'Texto demasiado largo',
    invalid_option: 'Elige una opción válida',
    invalid: 'Valor no válido',
  },
};
