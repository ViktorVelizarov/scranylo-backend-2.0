const { MultiFactorInfo } = require("firebase-admin/auth");
const prisma = require("../utils/prisma");

// check if user exists in the database and if the user has "admin" role, function is used by QA extension and relevancy web for authentication
const findAdminByEmail = async (adminEmail) => {
    const user = await prisma.snipx_Users.findFirst({
      where: {
        email: adminEmail,
        role: "admin"
      }
    });
    return user;
  }

  module.exports = {

    findAdminByEmail,

  };
  