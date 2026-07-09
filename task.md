# Monitor dashboard

Implemented against the live `Monitor` OpenAPI tag.

- Seven summary metrics.
- Paged recent defects with image previews.
- Defect distribution doughnut and total.
- Mission status overview.
- Paged inspection history with mission, defect, and date filters.
- Newest-first alerts with unread highlighting.
- Loading, error, empty, responsive, polling, and SignalR-ready states.

Verification: `npm run lint`, `npm test -- --watch=false`, `npm run build`.
