const { MultiFactorInfo } = require("firebase-admin/auth");
const prisma = require("../utils/prisma");

// get all users in the ext_users table, function used by relevancy web on the /users page
const findSnipxAllUsers = async () => {
    const allUsers = await prisma.snipx_Users.findMany({orderBy: {id: "desc"}});
    console.log("snipx_users:")
    console.log(allUsers)
    return allUsers;
  }

// check if user exists in the database and if the user has "admin" role, function is used by QA extension and relevancy web for authentication
const findSnipxAdminByEmail = async (adminEmail) => {
    const user = await prisma.snipx_Users.findFirst({
      where: {
        email: adminEmail,
        role: "admin"
      }
    });
    return user;
  }

  module.exports = {
    findSnipxAllUsers,
    findSnipxAdminByEmail,

  };
  