process.env.ENABLE_ALERT_SCHEDULER = 'false'

const { generateDailyAiAlertsForAllFacilities } = await import('../backend/src/services/alertservice.js')

const results = await generateDailyAiAlertsForAllFacilities()

console.log(`Generated ${results.length} facility alerts.`)
