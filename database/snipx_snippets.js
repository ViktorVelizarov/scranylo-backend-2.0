const prisma = require("../utils/prisma");

// Function to add a snippet to the database
const AddSnippet = async ({ snipx_user_id, inputText, green, orange, red }) => {
  try {
    const newSnippet = await prisma.snipxSnippet.create({
      data: {
        user_id: snipx_user_id,
        text: inputText,
        green: {},
        orange: {},
        red: {},
      },
    });
    return newSnippet;
  } catch (error) {
    console.error("Error adding snippet:", error);
    throw error;
  }
};

// Function to get all snippets
const findAllSnippets = async () => {
  const allSnippets = await prisma.snipxSnippet.findMany({ orderBy: { id: "desc" } });
  return allSnippets;
};

module.exports = {
  findAllSnippets,
  AddSnippet, // Export the new AddSnippet function
};
