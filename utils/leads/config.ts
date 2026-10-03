/* Central place for every Lead Engine setting. All values come from server-only env vars. */
const env = (name: string, fallback = "") => process.env[name]?.trim() || fallback;
const num = (name: string, fallback: number) => {
  const raw = process.env[name]?.trim();
  return raw && Number.isFinite(Number(raw)) ? Number(raw) : fallback;
};

export const config = {
  baseUrl: env("PUBLIC_BASE_URL").replace(/\/$/, ""),
  signingSecret: env("LEADS_SIGNING_SECRET"),
  ingestSecret: env("LEADS_INGEST_SECRET"),
  cronSecret: env("CRON_SECRET"),
  defaultCountryCode: env("LEADS_DEFAULT_COUNTRY_CODE", "+91"),
  defaultLanguage: env("LEADS_DEFAULT_LANGUAGE", "en-IN"),

  business: {
    name: env("BUSINESS_NAME", "KIIPL"),
    agentName: env("AGENT_NAME", "Riya"),
    pitch: env("BUSINESS_PITCH", "We help infrastructure and construction companies track site progress with live dashboards."),
    idealCustomer: env("IDEAL_CUSTOMER_PROFILE", "Construction, infrastructure or real-estate companies with active project sites and a budget for digital tools."),
  },

  anthropic: {
    configured: !!(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN),
    model: env("ANTHROPIC_MODEL", "claude-opus-5-5"),
  },

  smtp: {
    host: env("SMTP_HOST"),
    port: num("SMTP_PORT", 587),
    user: env("SMTP_USER"),
    pass: env("SMTP_PASS"),
    from: env("EMAIL_FROM"),
    replyTo: env("EMAIL_REPLY_TO"),
  },
  outreach: {
    maxSteps: num("OUTREACH_MAX_EMAILS", 3),
    followUpDays: num("OUTREACH_FOLLOW_UP_DAYS", 3),
    batchSize: num("OUTREACH_BATCH_SIZE", 25),
    autoCall: env("AUTO_CALL_AFTER_EMAIL", "false") === "true",
    callAfterDays: num("AUTO_CALL_AFTER_DAYS", 2),
    maxCallAttempts: num("MAX_CALL_ATTEMPTS", 2),
  },

  google: {
    clientEmail: env("GOOGLE_SERVICE_ACCOUNT_EMAIL"),
    privateKey: env("GOOGLE_PRIVATE_KEY").replace(/\\n/g, "\n"),
    impersonate: env("GOOGLE_IMPERSONATE_USER"),        // Workspace user to act as (needed for Meet links / invites)
    calendarId: env("GOOGLE_CALENDAR_ID", "primary"),
    sheetId: env("GOOGLE_SHEET_ID"),
    sheetTab: env("GOOGLE_SHEET_TAB", "Qualified Leads"),
  },
  booking: {
    timezone: env("BOOKING_TIMEZONE", "Asia/Kolkata"),
    startHour: num("BOOKING_START_HOUR", 10),
    endHour: num("BOOKING_END_HOUR", 18),
    slotMinutes: num("BOOKING_SLOT_MINUTES", 30),
    days: num("BOOKING_DAYS_AHEAD", 7),
    workdays: env("BOOKING_WORKDAYS", "1,2,3,4,5,6").split(",").map(Number),
  },

  twilio: {
    accountSid: env("TWILIO_ACCOUNT_SID"),
    authToken: env("TWILIO_AUTH_TOKEN"),
    from: env("TWILIO_FROM_NUMBER"),
    maxTurns: num("CALL_MAX_TURNS", 14),
  },

  meta: {
    verifyToken: env("META_VERIFY_TOKEN"),
    appSecret: env("META_APP_SECRET"),
    pageAccessToken: env("META_PAGE_ACCESS_TOKEN"),
  },
  apifyToken: env("APIFY_TOKEN"),

  qualifyMinScore: num("QUALIFY_MIN_SCORE", 60),
};

/* Which integrations are wired up — shown on the Leads page so gaps are obvious. */
export const integrationStatus = () => ({
  database: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
  claude: config.anthropic.configured,
  email: !!(config.smtp.host && config.smtp.from),
  calendar: !!(config.google.clientEmail && config.google.privateKey),
  sheets: !!(config.google.clientEmail && config.google.privateKey && config.google.sheetId),
  calling: !!(config.twilio.accountSid && config.twilio.authToken && config.twilio.from && config.baseUrl),
  metaLeadAds: !!(config.meta.verifyToken && config.meta.pageAccessToken),
  apify: !!config.apifyToken,
  signing: !!config.signingSecret,
});
