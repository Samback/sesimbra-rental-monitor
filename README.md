# Sesimbra Rental Monitor

Automatically maintained rental watch for long-term rentals around Sesimbra, Portugal.

## Current scope

### Primary areas
- Sesimbra
- Maçã
- Cotovia
- Sampaio
- Santana
- Corredoura
- Zambujal
- Venda Nova

### Main criteria
- T3 / 3 quartos / moradia T3: up to €1,600/month
- T2: up to €1,600/month only when area is strictly greater than 90 m²
- Exactly 90 m² does not qualify for T2
- Long-term rentals only in the main section

Secondary areas and rejected-but-interesting listings are kept separately when useful.

## Site

The published site is a static `index.html`. Listing cards use exact direct listing URLs only. Photos are shown when they can be reliably associated with the exact listing; AI-generated or AI-edited listing photos are labelled accordingly.

## Updates

The rental monitoring task runs three times per day (09:00, 14:00 and 19:00 Europe/Lisbon) and is intended to preserve relevant older listings while highlighting new, relisted, price-changed and changed-terms listings.

## Expanded source coverage

The monitor searches major portals including Idealista, Imovirtual, OLX, Casa Sapo, SuperCasa, CustoJusto, BPI Expresso Imobiliário, Properstar, Kyero, Green-acres, Mitula, Trovit and M2Bomber, along with publicly indexed Facebook pages/groups and local boards. Additional discovery portals include HáTudo, BuscaImovel, IMO Portugal, ComprarCasa, Casa IOL, Seeki.eu, Voxhouses, CasaYes and Explorador.

Direct agency inventory is checked at Luxury Place / LuxuryPlace Sesimbra (luxuryplaceimobiliaria.pt), Predimed (predimed.pt), ERA (era.pt / ERA Sesimbra), Century 21 (century21.pt), RE/MAX Portugal, IAD Portugal, Lugar Certo, DREAM TEAM Imobiliária (dreamteam.com.pt), The Agency Portugal / SON Mediação Imobiliária (theagencyportugal.com), and other local Sesimbra agencies. Current Idealista agency profiles for Sesimbra are also reviewed for additional agencies. KW Portugal and Zome are checked when they expose searchable rental inventory. Discovery results are leads only: each property must be confirmed on a specific listing or agency page before it is presented as available. Cross-posts are deduplicated, and current agency availability status overrides stale mirror listings.

The PAA / Plataforma do Arrendamento Acessível does not publicly display its available property inventory and is not treated as a crawlable feed. Public IHRU Arrenda or municipal affordable-housing competitions are checked separately only when active Sesimbra-area listings exist, and are labelled as program/eligibility-based rather than ordinary market rentals.

In this research pass, a DreamTEAM T2 listing surfaced at €1,300/month but its published area is 80.17 m², so it does not meet the T2 area threshold. The Agency Portugal surfaced a Sesimbra T2 listing, but its direct agency page could not be verified during that pass, so no new card was added. No qualifying Sesimbra rental was confirmed on Predimed, Century 21, or IAD; those sites remain in the scheduled source search.

The scheduled monitor researches and updates the catalog; the GitHub Pages workflow only publishes the static `index.html` and does not crawl listing portals itself.
