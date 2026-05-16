const required = [
  "DATABASE_URL",
  "API_TOKEN",
  "AUTH_SECRET",
  "APP_TIMEZONE",
];

export function validateEnv(): void {
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(", ")}`
    );
  }
}
