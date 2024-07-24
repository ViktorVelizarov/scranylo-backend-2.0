const { PrismaClient } = require("@prisma/client");

let prisma;

// In a production environment, create a new PrismaClient instance with logging enabled
if (process.env.NODE_ENV === "production") {
  prisma = new PrismaClient({
    log: ["query", "error", "info", "warn"],
  });
} else {
  // In a non-production environment, use the global prisma instance if it exists.
  // This prevents creating new connections on every hot-reload in development.
  // If it does not exist, create a new PrismaClient instance.
  if (!global.prisma) {
    global.prisma = new PrismaClient();
  }
  prisma = global.prisma;
}

// Export the prisma client instance, which will be used to interact with the database.
module.exports = prisma;
