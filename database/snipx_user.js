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

  const findSnipxUserByEmail = async (email) => {
    const user = await prisma.snipx_Users.findFirst({
      where: {
        email: email,
      }
    });
    return user;
  }

  const findSnipxUserByID = async (id) => {
    console.log("id in findById:", id)
    console.log("type", typeof id.toInt())
    const user = await prisma.snipx_Users.findFirst({
      where: {
        id: id.toInt(),
      }
    });
    console.log("found user", user)
    return user;
  }

  // find SnipX managers
const findSnipxManagers = async () => {
  const managers = await prisma.snipx_Users.findMany({
    where: {
      role: "manager"
    }
  });
  return managers;
}

  // Update a user by ID
  const updateSnipxUserById = async (id, data) => {
    console.log("data in edit:", data)
    const updatedUser = await prisma.snipx_Users.update({
      where: { id: parseInt(id) },
      data,
    });
    return updatedUser;
  };
  
  // Set a user's role to "deleted" by ID
const deleteSnipxUserById = async (id) => {
  console.log("userId in delete:", id);
  await prisma.snipx_Users.update({
    where: { id: parseInt(id) },
    data: { role: "deleted" },
  });
};

  // Create a new user
const addNewSnipxUser = async (data) => {
  console.log("add new user data:", data)
  const newUser = await prisma.snipx_Users.create({
    data,
  });
  return newUser;
};

  
  module.exports = {
    findSnipxAllUsers,
    findSnipxAdminByEmail,
    updateSnipxUserById,
    deleteSnipxUserById,
    addNewSnipxUser, 
    findSnipxManagers,
    findSnipxUserByEmail,
    findSnipxUserByID,
  };
  
  