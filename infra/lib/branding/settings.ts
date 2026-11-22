// Managed login branding for the Emberreach sign-in and sign-up pages (VTTER-62).
// The settings document follows Cognito's managed login branding schema: start from
// DescribeManagedLoginBrandingByClient with ReturnMergedResources=true and change values here.
// Colors are RRGGBBAA hex without '#'. Both modes get the same dark palette, and the page runs in LIGHT mode on
// purpose: Cognito writes these colors as base tokens on <body>, and in DARK mode Cloudscape's .awsui-dark-mode rules
// override some of them (form background, links, focus ring) with its stock navy and blue.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { CfnManagedLoginBranding } from 'aws-cdk-lib/aws-cognito'

/** The app's landing-page "forge" palette (app/src/index.css, .landing and .lp-btn), with alpha. */
export const PALETTE = {
  page: '140d0aff', // --forge
  form: '1d1612f2',
  formBorder: '4a3a30ff',
  field: '17110eff',
  fieldBorder: '5c4a3eff',
  placeholder: '8a7d73ff',
  heading: 'f6ece3ff', // --ash
  body: 'd9cdc2ff',
  muted: 'cdbcaeff', // --ash-muted
  ember: 'ff7a3dff',
  emberHot: 'ffb347ff',
  emberDeep: 'd9531eff',
  emberDark: 'a8380fff',
  onEmber: 'ffffffff',
  glass: 'ffffff0f', // .lp-btn.secondary
  glassHover: 'ffffff1f',
  glassBorder: 'ffffff47',
  ghostHover: '2b1d16ff',
  ghostActive: '3d2216ff',
  divider: '3a2f28ff',
  good: '6fd39aff',
  goodBg: '1b3326ff',
  warn: 'f0c45aff',
  warnBg: '3a2f12ff',
  bad: 'ff8a80ff',
  badBg: '3d1d1aff',
} as const

const P = PALETTE
const both = <T>(v: T) => ({ lightMode: v, darkMode: v })

const ghostButton = {
  defaults: { backgroundColor: P.glass, borderColor: P.glassBorder, textColor: P.heading },
  hover: { backgroundColor: P.glassHover, borderColor: P.emberHot, textColor: P.heading },
  active: { backgroundColor: P.ghostActive, borderColor: P.emberHot, textColor: P.emberHot },
}

export const SETTINGS = {
  components: {
    pageBackground: { image: { enabled: true }, ...both({ color: P.page }) },
    form: {
      borderRadius: 16,
      backgroundImage: { enabled: false },
      logo: { enabled: true, location: 'CENTER', position: 'TOP', formInclusion: 'IN' },
      ...both({ backgroundColor: P.form, borderColor: P.formBorder }),
    },
    pageText: both({ headingColor: P.heading, bodyColor: P.body, descriptionColor: P.muted }),
    primaryButton: both({
      defaults: { backgroundColor: P.ember, textColor: P.onEmber },
      hover: { backgroundColor: P.emberDeep, textColor: P.onEmber },
      active: { backgroundColor: P.emberDark, textColor: P.onEmber },
      disabled: { backgroundColor: P.ghostActive, borderColor: P.ghostActive },
    }),
    secondaryButton: both(ghostButton),
    idpButton: { standard: both(ghostButton), custom: {} },
    alert: { borderRadius: 12, ...both({ error: { backgroundColor: P.badBg, borderColor: P.bad } }) },
    favicon: { enabledTypes: ['SVG'] },
    phoneNumberSelector: { displayType: 'TEXT' },
    pageHeader: {
      backgroundImage: { enabled: false },
      logo: { enabled: false, location: 'START' },
      ...both({ borderColor: P.divider, background: { color: P.page } }),
    },
    pageFooter: {
      backgroundImage: { enabled: false },
      logo: { enabled: false, location: 'START' },
      ...both({ borderColor: P.divider, background: { color: P.page } }),
    },
  },
  componentClasses: {
    buttons: { borderRadius: 24 }, // pill buttons, like .lp-btn
    input: {
      borderRadius: 10,
      ...both({ defaults: { backgroundColor: P.field, borderColor: P.fieldBorder }, placeholderColor: P.placeholder }),
    },
    inputLabel: both({ textColor: P.heading }),
    inputDescription: both({ textColor: P.muted }),
    link: both({ defaults: { textColor: P.emberHot }, hover: { textColor: P.ember } }),
    focusState: both({ borderColor: P.emberHot }),
    divider: both({ borderColor: P.divider }),
    optionControls: both({
      defaults: { backgroundColor: P.field, borderColor: P.fieldBorder },
      selected: { backgroundColor: P.ember, foregroundColor: P.onEmber },
    }),
    dropDown: {
      borderRadius: 10,
      ...both({
        defaults: { itemBackgroundColor: P.field },
        hover: { itemBackgroundColor: P.ghostHover, itemBorderColor: P.ember, itemTextColor: P.heading },
        match: { itemBackgroundColor: P.ghostActive, itemTextColor: P.emberHot },
      }),
    },
    statusIndicator: both({
      success: { backgroundColor: P.goodBg, borderColor: P.good, indicatorColor: P.good },
      pending: { indicatorColor: P.muted },
      warning: { backgroundColor: P.warnBg, borderColor: P.warn, indicatorColor: P.warn },
      error: { backgroundColor: P.badBg, borderColor: P.bad, indicatorColor: P.bad },
    }),
    idpButtons: { icons: { enabled: true } },
  },
  categories: {
    global: { colorSchemeMode: 'LIGHT', spacingDensity: 'REGULAR', pageHeader: { enabled: false }, pageFooter: { enabled: false } },
    form: {
      displayGraphics: true,
      location: { horizontal: 'CENTER', vertical: 'CENTER' },
      sessionTimerDisplay: 'NONE',
      instructions: { enabled: false },
      languageSelector: { enabled: false },
    },
    auth: {
      // Social buttons first, then email and password.
      authMethodOrder: [[{ display: 'BUTTON', type: 'FEDERATED' }, { display: 'INPUT', type: 'USERNAME_PASSWORD' }]],
      federation: { interfaceStyle: 'BUTTON_LIST', order: [] as string[] },
    },
    signUp: { acceptanceElements: [{ enforcement: 'NONE', textKey: 'en' }] },
  },
}

const svg = (file: string) => readFileSync(join(import.meta.dirname, file)).toString('base64')

/**
 * Image assets. Each is sent for DARK and LIGHT. IDP_BUTTON_ICON assets are keyed by the identity provider's
 * name (resourceId); Cognito ships icons for Google, Facebook, Apple and Amazon, so only the OIDC ones need ours.
 */
export function brandingAssets(oidcProviders: string[]): CfnManagedLoginBranding.AssetTypeProperty[] {
  const icons: Record<string, string> = { Microsoft: 'microsoft.svg', GitHub: 'github.svg' }
  const items: { category: string; file: string; resourceId?: string }[] = [
    { category: 'PAGE_BACKGROUND', file: 'background.svg' },
    { category: 'FORM_LOGO', file: 'logo.svg' },
    // A copy of app/public/favicon.svg with <use> inlined: Cognito rejects <use> in branding SVGs.
    { category: 'FAVICON_SVG', file: 'favicon.svg' },
    ...oidcProviders.filter(p => icons[p]).map(p => ({ category: 'IDP_BUTTON_ICON', file: icons[p], resourceId: p })),
  ]
  return items.flatMap(({ category, file, resourceId }) => {
    const bytes = svg(file)
    return (['DARK', 'LIGHT'] as const).map(colorMode => ({ category, colorMode, extension: 'SVG', bytes, resourceId }))
  })
}
