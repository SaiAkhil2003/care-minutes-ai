# Care Minutes AI API

All responses use the shape `{ "data": ... }` for success and `{ "error": { "message": "...", "details": ... } }` for failures.

## Operational endpoints

- `GET /` and `GET /health`: liveness payload
- `GET /ready`: readiness payload, `503` when repository config is not ready
- `GET /status`: readiness payload with optional-service flags

## Facility endpoints

- `GET /facilities`
- `GET /facilities/:id`

## Dashboard and compliance endpoints

- `GET /dashboard/summary?facility_id=<uuid>`
- `GET /compliance/daily?facility_id=<uuid>&date=YYYY-MM-DD`
- `POST /compliance/daily`
- `GET /compliance/history?facility_id=<uuid>&start_date=YYYY-MM-DD&end_date=YYYY-MM-DD`

## Forecast endpoint

- `GET /forecast/quarterly?facility_id=<uuid>&today_date=YYYY-MM-DD&scenario_shift_minutes=<number>&scenario_shifts_per_week=<number>`

The forecast response includes total-care, RN, and overall compliance fields. Overall compliance is the lower of total-care and RN performance.

## Staff endpoints

- `GET /staff?facility_id=<uuid>`
- `POST /staff`
- `PUT /staff/:id`
- `DELETE /staff/:id?facility_id=<uuid>`

## Shift endpoints

- `GET /shifts?facility_id=<uuid>&start_date=YYYY-MM-DD&end_date=YYYY-MM-DD`
- `POST /shifts`
- `PUT /shifts/:id`
- `DELETE /shifts/:id?facility_id=<uuid>`

Overnight shifts are supported. If `end_time` is earlier than `start_time`, the backend rolls the shift into the next day.

## Reporting endpoints

- `GET /reports?facility_id=<uuid>&start_date=YYYY-MM-DD&end_date=YYYY-MM-DD`
- `GET /reports/audit.pdf?facility_id=<uuid>&start_date=YYYY-MM-DD&end_date=YYYY-MM-DD`

Audit reports include:

- facility and reporting period cover data
- summary totals and compliance
- daily breakdown
- staff type breakdown
- trend chart
- agency vs permanent split

## AI alert endpoints

- `GET /ai-alerts/latest?facility_id=<uuid>&date=YYYY-MM-DD`
- `POST /ai-alerts/run`

If `ANTHROPIC_API_KEY` is unavailable, alert generation returns a deterministic fallback alert instead of failing.
