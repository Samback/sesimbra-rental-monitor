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

In addition to the previously requested listing portals, the monitoring task searches Casa IOL and direct agency inventory such as RE/MAX Portugal, ERA Sesimbra, Lugar Certo, and other local Sesimbra agencies. Seeki.eu and Voxhouses are discovery leads only; every candidate must be checked against a specific listing or agency page before it is presented as available. SuperCasa remains in the search set and is checked for direct listing pages. Cross-posts are deduplicated, and a current agency status such as “rented” overrides older mirror listings.

The scheduled monitor researches and updates the catalog; the GitHub Pages workflow only publishes the static `index.html` and does not crawl listing portals itself.
