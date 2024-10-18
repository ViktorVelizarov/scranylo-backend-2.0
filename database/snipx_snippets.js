const prisma = require("../utils/prisma");

// Function to add a snippet to the database
const AddSnippet = async ({ snipx_user_id, type, date, inputText, green, orange, red, explanations, score, sentiment, action }) => {
  try {
    const cleanedText = inputText ? inputText.replace(/<\/?[^>]+(>|$)/g, "") : "";
    const newSnippet = await prisma.snipxSnippet.create({
      data: {
        user_id: snipx_user_id,
        type: type,
        date: date,
        text: cleanedText,
        green: green,
        orange: orange,
        red: red,
        explanations: explanations,
        score: score.toString(),
        sentiment: sentiment,
        action_text: action
      },
    });
    return newSnippet;
  } catch (error) {
    console.error("Error adding snippet:", error);
    throw error;
  }
};

// Function to find all snippets for users in a company
const findSnippetsByCompanyId = async (companyId) => {
  try {
    const companyUsers = await prisma.snipxUserCompany.findMany({
      where: { company_id: companyId },
      select: { user_id: true },
    });
    if (companyUsers.length === 0) return [];

    const userIds = companyUsers.map(relation => relation.user_id);
    const companySnippets = await prisma.snipxSnippet.findMany({
      where: { user_id: { in: userIds } },
      orderBy: { id: "desc" },
    });
    return companySnippets;
  } catch (error) {
    console.error("Error fetching company snippets:", error);
    throw error;
  }
};

// Function to find snippets for a user's company
const findSnippetsByUserCompanyId = async (userId) => {
  try {
    const userCompanyRelation = await prisma.snipxUserCompany.findUnique({
      where: { user_id: userId },
      include: { company: true },
    });

    if (!userCompanyRelation || !userCompanyRelation.company) return [];

    const companyId = userCompanyRelation.company_id;
    const companyUsers = await prisma.snipxUserCompany.findMany({
      where: { company_id: companyId },
      select: { user_id: true },
    });

    const userIds = companyUsers.map(relation => relation.user_id);
    const companySnippets = await prisma.snipxSnippet.findMany({
      where: { user_id: { in: userIds } },
    });

    return companySnippets;
  } catch (error) {
    console.error("Error fetching company snippets:", error);
    throw error;
  }
};

// Function to find all snippets for a specific user by their ID
const findSnippetsByUserId = async (userId) => {
  try {
    const userSnippets = await prisma.snipxSnippet.findMany({
      where: { user_id: parseInt(userId) },
      orderBy: { id: "desc" },
    });
    return userSnippets;
  } catch (error) {
    console.error("Error fetching user snippets:", error);
    throw error;
  }
};

// Function to find daily snippets for a specific user
const findDailySnippetsByUserId = async (userId) => {
  try {
    const dailySnippets = await prisma.snipxSnippet.findMany({
      where: { user_id: parseInt(userId), type: "daily" },
      orderBy: { id: "desc" },
    });
    return dailySnippets;
  } catch (error) {
    console.error("Error fetching daily snippets:", error);
    throw error;
  }
};

// Function to update a snippet by ID
const updateSnippetById = async (id, data) => {
  try {
    const updatedSnippet = await prisma.snipxSnippet.update({
      where: { id: parseInt(id) },
      data,
    });
    return updatedSnippet;
  } catch (error) {
    console.error("Error updating snippet:", error);
    throw error;
  }
};

// Function to delete a snippet by ID
const deleteSnippetById = async (id) => {
  try {
    await prisma.snipxSnippet.delete({
      where: { id: parseInt(id) },
    });
  } catch (error) {
    console.error("Error deleting snippet:", error);
    throw error;
  }
};

// Function to find snippets for a team by team ID
const findTeamSnippets = async (teamId) => {
  try {
    const teamMembers = await prisma.snipxUserTeam.findMany({
      where: { team_id: teamId },
      select: { user_id: true }
    });

    if (teamMembers.length === 0) return [];

    const userIds = teamMembers.map(member => member.user_id);
    const teamSnippets = await prisma.snipxSnippet.findMany({
      where: { user_id: { in: userIds } },
    });
    return teamSnippets;
  } catch (error) {
    console.error("Error fetching team snippets:", error);
    throw error;
  }
};

module.exports = {
  AddSnippet,
  findSnippetsByCompanyId,
  findSnippetsByUserCompanyId,
  findSnippetsByUserId,
  findDailySnippetsByUserId,
  updateSnippetById,
  deleteSnippetById,
  findTeamSnippets,
};
