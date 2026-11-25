# Lead and booking business rules

This document records the MVP rules used while the showroom, lead assignment and appointment flows are implemented on the existing Sales Copilot data model.

## Current system boundary

The existing system stores customers, conversations, messages, tasks and appointments in the Sales Copilot repository. Authentication supports `customer`, `advisor` and `manager` identities. Public test-drive requests may be anonymous, while authenticated customer requests are linked to the customer account. Each request creates a customer conversation plus follow-up task in one database transaction.

## MVP assumptions

- A customer selects a showroom before advisor matching. A free-form location is retained on the customer and appointment records.
- Showroom identity is stored in the normalized showroom and advisor-membership tables, while the selected address is retained on the customer and appointment for display.
- Assignment must use an active advisor eligible for the selected showroom. If no eligible advisor is available, the request remains unassigned and is visible to a manager.
- Availability is calculated from advisor working intervals, leave intervals and existing non-cancelled appointments. Tasks without an appointment interval do not block a booking.
- Appointment creation and reassignment run in one database transaction. A conflict is rejected with HTTP 409 and the existing assignment remains unchanged.
- A customer has one active owner at a time. Handoffs require an explicit manager or current-owner action and are recorded in the audit trail.
- Cancellation releases the time interval and keeps the appointment history. Rescheduling is modeled as an update with conflict validation.
- Customer-facing access must be scoped to the customer identity. Advisors can read and update owned leads. Managers can manage showroom, advisor, assignment and schedule records.

## State transitions

- Lead: `new` → `assigned` → `contacted` → `qualified` → `appointment` → `won` or `lost`.
- Appointment: `requested` → `confirmed` → `completed`, with `cancelled` as a terminal state.
- Assignment: `pending` → `active` → `transferred` or `closed`.

Invalid transitions must return a validation error and must not partially write related records.

## Concurrency

Booking and assignment operations must validate conflicts under the same database transaction that writes the record. The database must enforce a uniqueness or exclusion strategy for overlapping active appointments when the production database supports it. SQLite tests must exercise the same conflict path through a transaction-level check.

## Notification and audit

A successful assignment, confirmation, transfer, cancellation or reschedule emits an in-app notification and an audit record. Failed transactions emit neither. Notification delivery is best-effort after commit and must not make the booking transaction appear successful when the write failed.

## Production hardening checklist

- Configure `PUBLIC_LEAD_ADVISOR_ID` or seed at least one qualified active advisor. The demo inbox fallback is development-only.
- Add a database-level exclusion/overlap constraint for active appointments on PostgreSQL.
- Configure verified customer identity and notification delivery providers before exposing the public portal.
- Run the full backend test suite in an environment with the pinned Python dependencies installed.
