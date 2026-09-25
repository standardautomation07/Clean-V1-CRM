import { defineConfig } from "drizzle-kit";
import path from "path";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL, ensure the database is provisioned");
}

const url = process.env.DATABASE_URL.includes("sslmode=")
  ? process.env.DATABASE_URL
  : process.env.DATABASE_URL.includes("?")
    ? `${process.env.DATABASE_URL}&sslmode=require`
    : `${process.env.DATABASE_URL}?sslmode=require`;

export default defineConfig({
  schema: path.join(__dirname, "./src/schema/index.ts"),
  dialect: "postgresql",
  dbCredentials: {
    url,
  },
});
