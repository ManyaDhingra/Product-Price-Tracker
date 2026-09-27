# Design Document — Product Price Tracker

## 1. Overview

The Product Price Tracker is a full-stack application developed for the INE Software Engineer Intern assessment.

The application allows users to:

- Search products from the INE mock store
- Select a specific product option
- Track product + option combinations
- Scrape live price and stock
- Retry transient scraping failures
- Store every scrape attempt
- View price and stock history
- View per-product scrape logs
- Export tracking data as CSV
- Automatically scrape tracked products every 2 hours

The main design priority is **reliability and truthful historical data**. A failed scrape must remain a failed scrape and must never be represented as a successful observation using stale values.

---

# 2. System Architecture

```text
                    ┌─────────────────┐
                    │      User       │
                    └────────┬────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │ React + Vite    │
                    │    Frontend     │
                    │    (Vercel)     │
                    └────────┬────────┘
                             │ REST API
                             ▼
                    ┌─────────────────┐
                    │ Express Backend │
                    │    (Render)     │
                    └───────┬─┬───────┘
                            │ │
                ┌───────────┘ └────────────┐
                ▼                          ▼
       ┌─────────────────┐        ┌─────────────────┐
       │ Supabase        │        │ Playwright      │
       │ PostgreSQL      │        │ + Chromium      │
       │                 │        │                 │
       │ Products        │        │ Live Price      │
       │ Options         │        │ Stock           │
       │ Tracked Items   │        │ Dynamic Flow    │
       │ Scrape Logs     │        └────────┬────────┘
       └─────────────────┘                 │
                                           ▼
                                  ┌─────────────────┐
                                  │ INE Mock Store  │
                                  └─────────────────┘

                    Every 2 Hours
                         │
                         ▼
                ┌──────────────────┐
                │  cron-job.org    │
                └────────┬─────────┘
                         │
                         ▼
              POST /api/scheduler/scrape
                         │
                         ▼
                ┌──────────────────┐
                │ 202 Accepted     │
                │ Background Run   │
                └──────────────────┘
