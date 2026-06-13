# Architecture

This project follows a full-stack web app structure with UI pages, reusable components, API routes, database migrations, business workflow logic, and environment-based configuration.

## Main Areas

- Next.js app routes, pages, and layouts
- Reusable React components
- Express API routes and middleware
- Supabase client configuration
- PostgreSQL migrations
- Business workflow helpers and services
- Tailwind CSS styling and responsive interface

## Data Flow

Users interact with forms and dashboard pages in the Next.js frontend. The frontend calls the Express API, which validates requests, applies authentication and tenant checks, reads or writes records through Supabase, and returns structured data for dashboard summaries and detail screens.

## Configuration

Runtime settings are provided through environment variables. The public repo includes `.env.example` with placeholder values only.
