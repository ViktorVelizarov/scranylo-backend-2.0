const { MultiFactorInfo } = require("firebase-admin/auth");
const prisma = require("../utils/prisma");

// create new user, function used by relevancy web on the /users page
const addNewUser = async (data) => {
  console.log("received add user data:")
  console.log(data)
  const newUser = await prisma.users.create({
    data: {
      email: data.email,
      role: data.role,
      company_scraper: data.company_scraper
    }
  });
  return newUser;
}

// update existing user, function used by relevancy web on the /users page
const updateUserById = async (data) => {
  console.log("received update user data:")
  console.log(data)
  const updatedUser = await prisma.users.update({
    where: { id: data.id },
    data: {
      email: data.email,
      role: data.role,
      company_scraper: data.company_scraper
    },
  });
  return updatedUser;
};

// delete selected user, function used by relevancy web on the /users page
const deleteUserById = async (userId) => {
  console.log("userId in delete:", userId)
  const deletedUser = await prisma.users.delete({
    where: { id: parseInt(userId) },
  });
  return deletedUser;
};

// get all users in the ext_users table, function used by relevancy web on the /users page
const findAllUsers = async () => {
  const allUsers = await prisma.users.findMany({orderBy: {id: "desc"}});
  return allUsers;
}

// check if user exists in the database and if the user has "admin" role, function is used by QA extension and relevancy web for authentication
const findAdminByEmail = async (adminEmail) => {
  const user = await prisma.users.findFirst({
    where: {
      email: adminEmail,
      role: "admin"
    }
  });
  return user;
}

// check if user exists in the database, this function is used by sourcing extension
const findUserByEmail = async (userEmail) => {
  const user = await prisma.users.findFirst({
    where: {
      email: userEmail
    }
  });
  return user;
}

// function to find a user by ID, used by relevancy web on the /users page
const findUserById = async (userId) => {
  const user = await prisma.users.findUnique({
    where: { id: parseInt(userId) },
  });
  return user;
}

// function check if user exists in the database and if not, then creates new user. Function calls while creating new job, so all job owners would be in the database of users.
const checkUsers = async (owners) => {
  console.log(owners);
  owners.forEach(async (owner) => {
    const ownerEmail = `${owner.toLowerCase()}@scaleup.agency`;
    const existingUser = await prisma.users.findFirst({
      where: {
        email: ownerEmail,
      }
    });
    if (!existingUser) {
      const newUser = {
        email: ownerEmail,
        role: "sourcer",
      };
      await addNewUser(newUser);
      console.log(`Created user with email ${ownerEmail}`);
    } else {
      console.log(`User with email ${ownerEmail} already exists`);
    }
  });
}

module.exports = {
  addNewUser,
  updateUserById,
  deleteUserById,
  findAllUsers,
  findAdminByEmail,
  findUserByEmail,
  findUserById, 
  checkUsers,
};
