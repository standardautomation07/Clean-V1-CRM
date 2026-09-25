import { defineConfig } from "drizzle-kit";
import path from "path";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL, ensure the database is provisioned");
}

function withSsl(url: string) {
  if (/[?&]uselibpqcompat=/i.test(url)) return url;
  const join = url.includes("?") ? "&" : "?";
  return `${url}${join}uselibpqcompat=true&sslmode=require`;
}

export default defineConfig({
  schema: path.join(__dirname, "./src/schema/index.ts"),
  dialect: "postgresql",
  dbCredentials: {
    url: withSsl(process.env.DATABASE_URL),
  },
});
