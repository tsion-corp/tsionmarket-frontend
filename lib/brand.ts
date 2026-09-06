// The single source of the product name. Translations interpolate it as a
// {brand} parameter and components render it from here, so a rename is one
// edit and the catalogs never embed the name (enforced by the i18n tests).
export const BRAND = "Ark";

/** Where support reads messages. Shown on the landing footer and, while the
 *  app is down for maintenance, on the maintenance page. */
export const SUPPORT_EMAIL = "tsionarksupport@gmail.com";

// Support takes WhatsApp messages on this line, not voice calls, so it is a
// wa.me link rather than a tel: one. wa.me wants the number in international
// form with no plus and no leading zero.
export const WHATSAPP_NUMBER = "2349137089482";
