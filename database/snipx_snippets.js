
const prisma = require("../utils/prisma");

// Function to add a snippet to the database
const AddSnippet = async ({ snipx_user_id, inputText, green, orange, red, explanations, score, sentiment }) => {
  try {

    const cleanedText = inputText ? inputText.replace(/<\/?[^>]+(>|$)/g, "") : "";

    const newSnippet = await prisma.snipxSnippet.create({
      data: {
        user_id: snipx_user_id,
        text: cleanedText,
        green: green,
        orange: orange,
        red: red,
        explanations: explanations,
        score: score,
        sentiment: sentiment
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

// Function to update a snippet by ID
const updateSnippetById = async (id, { user_id, text, green, orange, red, explanations, score, sentiment }) => {
  try {
    const updatedSnippet = await prisma.snipxSnippet.update({
      where: { id: parseInt(id) },
      data: {
        user_id,
        text,
        green,
        orange,
        red,
        explanations,
        score,
        sentiment
      },
    });
    console.log("in function:")
    console.log(updatedSnippet)
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

module.exports = {
  findAllSnippets,
  AddSnippet,
  updateSnippetById,
  deleteSnippetById,
};
