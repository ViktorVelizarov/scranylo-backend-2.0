// snipx_user.js
const prisma = require("../utils/prisma");

/**
 * Retrieve all users from the Snipx_Users table, ordered by ID in descending order.
 */
const findSnipxAllUsers = async () => {
    const allUsers = await prisma.snipx_Users.findMany({ orderBy: { id: "desc" } });
    console.log("snipx_users:", allUsers);
    return allUsers;
};

/**
 * Find an admin user by their email. Checks if the user has the role "admin".
 */
const findSnipxAdminByEmail = async (adminEmail) => {
    const user = await prisma.snipx_Users.findFirst({
        where: {
            email: adminEmail,
            role: "admin"
        }
    });
    return user;
};

/**
 * Find a user by their email.
 */
const findSnipxUserByEmail = async (email) => {
    const user = await prisma.snipx_Users.findFirst({
        where: { email }
    });
    return user;
};

/**
 * Find a user by their ID.
 */
const findSnipxUserByID = async (id) => {
    console.log("id in findById:", id);
    const user = await prisma.snipx_Users.findFirst({
        where: { id: parseInt(id) }
    });
    console.log("found user", user);
    return user;
};

/**
 * Retrieve all users with the "manager" role.
 */
const findSnipxManagers = async () => {
    const managers = await prisma.snipx_Users.findMany({
        where: { role: "manager" }
    });
    return managers;
};

/**
 * Update a user by their ID.
 */
const updateSnipxUserById = async (id, data) => {
    console.log("data in edit:", data);
    const updatedUser = await prisma.snipx_Users.update({
        where: { id: parseInt(id) },
        data
    });
    return updatedUser;
};

/**
 * Set a user's role to "deleted" by ID.
 */
const deleteSnipxUserById = async (id) => {
    console.log("userId in delete:", id);
    await prisma.snipx_Users.update({
        where: { id: parseInt(id) },
        data: { role: "deleted" }
    });
};

/**
 * Create a new user.
 */
const addNewSnipxUser = async (data) => {
    console.log("add new user data:", data);
    const newUser = await prisma.snipx_Users.create({ data });
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
    findSnipxUserByID
};
