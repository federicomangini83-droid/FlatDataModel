import { pbkdf2Sync, randomBytes } from "node:crypto";
const [username, password] = process.argv.slice(2);
if (!username || !password) {
  console.error("Uso: npm run user -- nomeutente password");
  process.exit(1);
}
const iterations = 310000;
const saltBuffer = randomBytes(16);
const encode = (buffer) => buffer.toString("base64url");
console.log(JSON.stringify({ username, enabled: true, salt: encode(saltBuffer), iterations, passwordHash: encode(pbkdf2Sync(password, saltBuffer, iterations, 32, "sha256")) }, null, 2));
