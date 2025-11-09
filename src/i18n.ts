import { i18n } from "@lingui/core";
import type { Messages } from "@lingui/core";
import { messages as enMessages } from "./locales/en/messages";
import { messages as ptMessages } from "./locales/pt/messages";

export const supportedLocales = ["en", "pt"] as const;
export type SupportedLocale = (typeof supportedLocales)[number];
export const defaultLocale: SupportedLocale = "en";

const catalogs: Record<SupportedLocale, Messages> = {
    en: enMessages,
    pt: ptMessages,
};

export function resolveLocale(input?: string | null): SupportedLocale {
    if (!input) return defaultLocale;

    const normalized = input.trim().toLowerCase();
    const match = supportedLocales.find(
        (locale) =>
            normalized === locale || normalized.startsWith(`${locale}-`),
    );

    return (match ?? defaultLocale) as SupportedLocale;
}

export function activateLocale(locale: SupportedLocale = defaultLocale) {
    const messages = catalogs[locale];

    if (!messages) {
        throw new Error(`Unsupported locale "${locale}"`);
    }

    i18n.load(locale, messages);
    i18n.activate(locale);

    return i18n;
}

activateLocale(defaultLocale);

export { i18n };
