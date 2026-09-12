# Facilities Note: Office HVAC Maintenance
Date: 2026-05-01
The air filters in Building 4 are replaced every second Tuesday of the month. The compressor unit will undergo scheduled maintenance on June 14.

---

# Infrastructure Policy: Database Backup Retention
Date: 2026-05-15
Production PostgreSQL snapshots are retained for 30 days in cold storage.
Full database backups are executed weekly on Sundays at 02:00 UTC.
Point-in-time recovery (WAL archiving) is maintained with a 7-day retention window.
