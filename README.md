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
