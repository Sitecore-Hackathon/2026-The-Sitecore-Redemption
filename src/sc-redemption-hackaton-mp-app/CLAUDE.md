# Sitecore Marketplace App - AI Development Guide

## Project Overview

This is a **Sitecore Marketplace extension application** built with Next.js 16 and the Sitecore Marketplace SDK. The app runs embedded inside the Sitecore Marketplace parent window via iframe and communicates using the `@sitecore-marketplace-sdk/client` SDK with `window.parent` messaging.

**Critical:** This app MUST be loaded within a Sitecore Marketplace context (not standalone) - the MarketplaceProvider will show error messages if loaded outside the parent window.

## Architecture

### SDK-Based Architecture
- **ClientSDK initialization** happens in `MarketplaceProvider` (components/providers/marketplace.tsx)
- SDK connects to `window.parent` with modules like `XMC` for Sitecore XM Cloud integration
- Two custom hooks expose SDK functionality throughout the app:
  - `useMarketplaceClient()` - access to ClientSDK instance for API queries
  - `useAppContext()` - provides ApplicationContext including user info and resourceAccess

### Provider Hierarchy
```
RootLayout (app/layout.tsx)
  └─ MarketplaceProvider (wraps entire app)
       └─ ClientSDKContext + AppContextContext
```

All page components are "use client" - this is a client-side app with no server-side rendering.

## Development Workflow

### Running the App
```bash
npm run dev          # Start dev server with Turbopack (Next.js 16)
npm run build        # Production build
npm run typecheck    # TypeScript validation
npm run lint         # ESLint
npm run format       # Prettier formatting
```

### Adding shadcn/ui Components
This project uses **shadcn/ui with Radix Nova style** and Tailwind CSS v4:

```bash
npx shadcn@latest add button card badge
```

Components are added to `components/ui/` and imported via `@/components/ui/button`. Configuration in components.json specifies:
- Style: `radix-nova`
- Icons: `lucide` (primary) + custom Icon component for `@mdi/js` paths
- Path aliases: `@/components`, `@/lib`, `@/hooks`

## Patterns & Conventions

### Component Structure
- **Client components:** All interactive components use `"use client"` directive
- **Example components:** Located in `components/examples/built-in-auth/` to demonstrate SDK usage
- **UI components:** shadcn/ui components in `components/ui/` (auto-generated, safe to customize)

### SDK Query Pattern
```typescript
const client = useMarketplaceClient();
const result = await client.query("xmc.sites.listLanguages", {
  params: { query: { sitecoreContextId: contextId } }
});
```

Always extract contextId from `appContext.resourceAccess[0].context.preview` before XMC queries.

### Styling
- **Tailwind CSS v4** with custom theme in `app/globals.css` (@theme inline)
- **Custom imports:** Uses `@import "shadcn/tailwind.css"` and `tw-animate-css`
- **Dark mode:** Theme toggle via "d" hotkey (ThemeProvider component) - avoid typing targets
- Color palette includes extended alpha variants (whiteAlpha, blackAlpha) and full color scales

### Icon Usage
Two icon systems:
1. **Lucide React** (primary): `import { ChevronDown } from "lucide-react"`
2. **Material Design Icons**: Custom `<Icon>` component in `lib/icon.tsx` accepts `path` from `@mdi/js`

### Type Safety
- Sitecore SDK types available via `@sitecore-marketplace-sdk/xmc` (e.g., `Xmapp.Language`)
- ApplicationContext type from `@sitecore-marketplace-sdk/client`
- Always type SDK responses: `languagesResponse.data?.data ?? []`

## Key Files

- [components/providers/marketplace.tsx](components/providers/marketplace.tsx) - SDK initialization, context providers, custom hooks
- [app/layout.tsx](app/layout.tsx) - Root layout with MarketplaceProvider wrapper
- [app/page.tsx](app/page.tsx) - Main demo page showing SDK examples
- [components.json](components.json) - shadcn/ui configuration
- [package.json](package.json) - Note the SDK dependencies: `@sitecore-marketplace-sdk/client` and `/xmc`

## Common Tasks

**Add a new SDK example:**
1. Create component in `components/examples/built-in-auth/`
2. Use `useMarketplaceClient()` and `useAppContext()` hooks
3. Follow the pattern in `list-languages.tsx` (loading states, error handling, Badge tags)
4. Add to main page with Separator between examples

**Add new UI component:**
```bash
npx shadcn@latest add <component-name>
```
Then import via `@/components/ui/<component-name>`

**Access Sitecore context:**
```typescript
const appContext = useAppContext();
const contextId = appContext.resourceAccess?.[0]?.context?.preview;
```

## Testing in Marketplace

The app requires proper Sitecore Marketplace extension point configuration. If you see initialization errors, verify:
1. App is loaded inside Marketplace parent window (not direct URL)
2. Extension points are configured in Marketplace settings
3. SDK modules are properly initialized (check browser console)
