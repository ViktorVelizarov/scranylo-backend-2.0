const { MultiFactorInfo } = require("firebase-admin/auth");
const prisma = require("../utils/prisma");

// get all users in the ext_users table, function used by relevancy web on the /users page
const findAllSnippets = async () => {
    const allSnippets = await prisma.snipxSnippet.findMany({orderBy: {id: "desc"}});
    return allSnippets;
  }

  module.exports = {
    findAllSnippets,

  };