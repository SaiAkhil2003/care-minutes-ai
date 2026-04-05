import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  buildSettingsForm,
  buildSettingsPayload,
  isSettingsFormDirty,
  settingsTimezoneOptions,
  validateSettingsForm
} from './settingsView.js'
import { getSettingsEmptyState } from './facilityAccess'

const ToggleField = ({ checked, description, disabled, id, label, onChange }) => (
  <label className="toggle-field" htmlFor={id}>
    <span className="toggle-copy">
      <strong>{label}</strong>
      <small>{description}</small>
    </span>
    <span className={`toggle-shell ${checked ? 'toggle-shell-active' : ''}`}>
      <input
        checked={checked}
        disabled={disabled}
        id={id}
        type="checkbox"
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="toggle-thumb" aria-hidden="true" />
    </span>
  </label>
)

const ReadOnlyCard = ({ label, value, helper }) => (
  <div className="summary-kpi settings-summary-card">
    <span>{label}</span>
    <strong>{value}</strong>
    <p className="card-helper">{helper}</p>
  </div>
)

function SettingsPage({ error, loading, onRetry, onSave, saving, settings }) {
  const [form, setForm] = useState(() => buildSettingsForm(settings))
  const [validationError, setValidationError] = useState('')
  const emptyState = getSettingsEmptyState(error)

  const isDirty = useMemo(
    () => isSettingsFormDirty({ currentSettings: settings, form }),
    [form, settings]
  )
  const residentCount = settings?.facility_details?.resident_count ?? 'N/A'
  const careMinutesTarget = settings?.anacc_settings?.care_minutes_target ?? 'N/A'
  const rnMinutesTarget = settings?.anacc_settings?.rn_minutes_target ?? 'N/A'
  const subsidyRate = settings?.anacc_settings?.rate_per_resident_per_day ?? 'N/A'

  const updateField = (field) => (value) => {
    setValidationError('')
    setForm((currentValue) => ({
      ...currentValue,
      [field]: value
    }))
  }

  const handleReset = () => {
    setForm(buildSettingsForm(settings))
    setValidationError('')
  }

  const handleSubmit = (event) => {
    event.preventDefault()

    const nextValidationError = validateSettingsForm(form)

    if (nextValidationError) {
      setValidationError(nextValidationError)
      return
    }

    setValidationError('')
    onSave(buildSettingsPayload({
      currentSettings: settings,
      form
    }))
  }

  if (loading && !settings) {
    return (
      <section className="surface-card">
        <div className="loading-state" role="status" aria-live="polite">
          <div className="loading-state-icon" aria-hidden="true" />
          <div className="loading-state-copy">
            <h3>Loading settings</h3>
            <p>Fetching facility profile, alert preferences, and display details.</p>
          </div>
        </div>
      </section>
    )
  }

  if (!settings) {
    return (
      <section className="surface-card">
        <div className="empty-state">
          <div className="empty-state-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 8v4m0 4h.01M4.93 19h14.14a2 2 0 0 0 1.73-3L13.73 3a2 2 0 0 0-3.46 0L3.2 16a2 2 0 0 0 1.73 3Z" />
            </svg>
          </div>
          <h3>{emptyState.title}</h3>
          <p>{emptyState.description}</p>
          <div className="button-row">
            <button className="btn btn-secondary" type="button" onClick={onRetry}>
              Try again
            </button>
            <Link className="btn btn-primary" to="/">
              Back to dashboard
            </Link>
          </div>
        </div>
      </section>
    )
  }

  return (
    <form className="page-stack settings-form" onSubmit={handleSubmit}>
      {validationError || error ? (
        <div className="notice-banner notice-banner-danger" role="alert">
          {validationError || error}
        </div>
      ) : null}

      <section className="surface-card">
        <div className="section-head">
          <div>
            <p className="section-eyebrow">Profile</p>
            <h2 className="section-title">Primary contact</h2>
            <p className="section-subtitle">These details appear in reports, alert routing, and the admin card.</p>
          </div>
        </div>
        <div className="form-grid settings-form-grid">
          <label className="field">
            <span>Name</span>
            <input
              autoComplete="name"
              disabled={saving}
              type="text"
              value={form.manager_name}
              onChange={(event) => updateField('manager_name')(event.target.value)}
            />
          </label>
          <label className="field">
            <span>Role / title</span>
            <input
              autoComplete="organization-title"
              disabled={saving}
              type="text"
              value={form.manager_role}
              onChange={(event) => updateField('manager_role')(event.target.value)}
            />
          </label>
          <label className="field">
            <span>Email</span>
            <input
              autoComplete="email"
              disabled={saving}
              type="email"
              value={form.manager_email}
              onChange={(event) => updateField('manager_email')(event.target.value)}
            />
          </label>
          <label className="field">
            <span>Phone</span>
            <input
              autoComplete="tel"
              disabled={saving}
              type="tel"
              value={form.manager_phone}
              onChange={(event) => updateField('manager_phone')(event.target.value)}
            />
          </label>
        </div>
      </section>

      <section className="surface-card">
        <div className="section-head">
          <div>
            <p className="section-eyebrow">Account &amp; security</p>
            <h2 className="section-title">Access controls</h2>
            <p className="section-subtitle">Secure sign-in is not configured in this MVP codebase, so password and logout controls are not available here yet.</p>
          </div>
        </div>
        <div className="button-row">
          <button className="btn btn-secondary" disabled type="button">
            Manage sign-in
          </button>
          <button className="btn btn-secondary" disabled type="button">
            Manage sessions
          </button>
          <button className="btn btn-danger" disabled type="button">
            Log out
          </button>
        </div>
      </section>

      <section className="surface-card">
        <div className="section-head">
          <div>
            <p className="section-eyebrow">Notifications</p>
            <h2 className="section-title">Daily alert delivery</h2>
            <p className="section-subtitle">Keep alerting simple for the team on shift.</p>
          </div>
        </div>
        <div className="settings-stack">
          <label className="field">
            <span>Daily AI shift alert time</span>
            <input
              disabled={saving}
              type="time"
              value={form.daily_alert_time}
              onChange={(event) => updateField('daily_alert_time')(event.target.value)}
            />
          </label>
          <div className="settings-toggle-group">
            <ToggleField
              checked={form.email_alerts_enabled}
              description={`Send operational alerts to ${form.manager_email || 'the primary contact email'}.`}
              disabled={saving}
              id="email_alerts_enabled"
              label="Email alerts"
              onChange={updateField('email_alerts_enabled')}
            />
            <ToggleField
              checked={form.in_app_alerts_enabled}
              description="Keep alert cards visible in the app for quick follow-up."
              disabled={saving}
              id="in_app_alerts_enabled"
              label="In-app alerts"
              onChange={updateField('in_app_alerts_enabled')}
            />
            <ToggleField
              checked={form.urgent_breach_alerts_enabled}
              description="Escalate urgent RN coverage breaches when a daily gap is detected."
              disabled={saving}
              id="urgent_breach_alerts_enabled"
              label="Urgent breach alerts"
              onChange={updateField('urgent_breach_alerts_enabled')}
            />
          </div>
        </div>
      </section>

      <section className="surface-card">
        <div className="section-head">
          <div>
            <p className="section-eyebrow">Facility preferences</p>
            <h2 className="section-title">Facility setup</h2>
            <p className="section-subtitle">Only low-risk details are editable here. Compliance inputs remain read-only in Settings.</p>
          </div>
        </div>
        <div className="form-grid settings-form-grid">
          <label className="field">
            <span>Facility name</span>
            <input
              disabled={saving}
              type="text"
              value={form.facility_name}
              onChange={(event) => updateField('facility_name')(event.target.value)}
            />
          </label>
          <label className="field">
            <span>Timezone</span>
            <select
              disabled={saving}
              value={form.timezone}
              onChange={(event) => updateField('timezone')(event.target.value)}
            >
              {settingsTimezoneOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="settings-summary-grid">
          <ReadOnlyCard
            helper="Read only here to avoid changing live compliance calculations from the wrong screen."
            label="Resident count"
            value={residentCount}
          />
          <ReadOnlyCard
            helper="Loaded from facility compliance configuration."
            label="Care minutes target"
            value={`${careMinutesTarget} min`}
          />
          <ReadOnlyCard
            helper="Loaded from facility compliance configuration."
            label="RN minimum target"
            value={`${rnMinutesTarget} min`}
          />
          <ReadOnlyCard
            helper="Stored subsidy rate used by forecast and finance views."
            label="AN-ACC rate"
            value={`$${subsidyRate}`}
          />
        </div>
      </section>

      <section className="surface-card">
        <div className="section-head">
          <div>
            <p className="section-eyebrow">Appearance</p>
            <h2 className="section-title">Workspace theme</h2>
            <p className="section-subtitle">The current deployment uses the standard light workspace so charts and reports stay consistent across teams.</p>
          </div>
        </div>
        <ReadOnlyCard
          helper="Dark and system themes are not enabled in the current styling layer."
          label="Current appearance"
          value="Light workspace"
        />
      </section>

      <section className="surface-card">
        <div className="section-head">
          <div>
            <p className="section-eyebrow">Billing</p>
            <h2 className="section-title">Subscription</h2>
            <p className="section-subtitle">Billing management has not been wired into this repo yet.</p>
          </div>
        </div>
        <div className="summary-kpi settings-summary-card">
          <span>Billing management</span>
          <strong>Coming soon</strong>
          <p className="card-helper">Add a Stripe customer portal or a managed billing workflow before exposing subscription changes here.</p>
        </div>
      </section>

      <div className="form-footer settings-form-footer">
        <div className="button-row">
          <Link className="btn btn-secondary" to="/">
            Back to dashboard
          </Link>
          <button className="btn btn-secondary" disabled={!isDirty || saving} type="button" onClick={handleReset}>
            Reset
          </button>
        </div>
        <button className="btn btn-primary" aria-busy={saving} disabled={!isDirty || saving} type="submit">
          {saving ? 'Saving...' : 'Save settings'}
        </button>
      </div>
    </form>
  )
}

export default SettingsPage
