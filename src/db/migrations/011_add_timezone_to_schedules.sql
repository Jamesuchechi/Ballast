-- Migration: 011_add_timezone_to_schedules.sql
-- Adds timezone column to schedules table with default 'UTC'.

ALTER TABLE schedules ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'UTC';
