# Product Price Tracker

A full-stack product price tracking application built for the INE Software Engineer Intern assessment.

The application allows users to search products from the INE mock storefront, select a product option, track it, periodically scrape its live price and stock, and view historical price/stock data and scrape logs.

## Live Application

- Frontend: https://product-price-tracker-pearl.vercel.app/
- Backend API: https://product-price-tracker-api-3073.onrender.com/
- GitHub: https://github.com/ManyaDhingra/Product-Price-Tracker

## Features

- Search products by partial or full product name
- View product details and available options
- Track selected product options
- Scrape live price and stock using Playwright
- Automatic retries for transient scraping failures
- Honest failure logging
- Price and stock history
- Per-product scrape logs
- CSV export
- External scheduler running every 2 hours
- Background scheduler execution
- Scheduler concurrency protection
- Sequential product scraping to control browser/memory usage
- Headed scraper mode for demonstration and debugging

## Tech Stack

### Frontend
- React
- Vite

### Backend
- Node.js
- Express

### Database
- Supabase PostgreSQL

### Scraping
- Playwright
- HTTP/API-based metadata retrieval where possible
- Browser automation only where required for dynamic live-offer data

### Deployment
- Vercel — frontend
- Render — backend
- Supabase — PostgreSQL
- cron-job.org — external scheduler

---

# Architecture

```text
                    ┌─────────────────────┐
                    │   React + Vite      │
                    │      Vercel         │
                    └──────────┬──────────┘
                               │
                               │ REST API
                               ▼
                    ┌─────────────────────┐
                    │ Node.js + Express   │
                    │       Render        │
                    └──────────┬──────────┘
                               │
             ┌─────────────────┼─────────────────┐
             │                 │                 │
             ▼                 ▼                 ▼
       Product APIs       Scheduler API     Scraper
                                                 │
                                                 ▼
                                           INE Mock Store
                                                 │
                                                 ▼
                                      Supabase PostgreSQL
