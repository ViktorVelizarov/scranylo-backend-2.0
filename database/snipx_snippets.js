
const prisma = require("../utils/prisma");

// Function to add a snippet to the database
const AddSnippet = async ({ snipx_user_id, type,  date,  inputText, green, orange, red, explanations, score, sentiment, action }) => {
  try {

    const cleanedText = inputText ? inputText.replace(/<\/?[^>]+(>|$)/g, "") : "";
    console.log("score", score)
    console.log("received date:" , date)
    console.log("type in addSnippet:")
    console.log(type)
    const now = new Date();
    console.log("now", now)
    const currentDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    console.log( "current date" ,currentDate)
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
        action_text : action
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

// Function to get all snippets for a specific user by their ID
const findSnippetsByUserId = async (userId) => {
  try {
    const userSnippets = await prisma.snipxSnippet.findMany({
      where: {
        user_id: parseInt(userId),
    },
      orderBy: { id: "desc" },
    });
    return userSnippets;
  } catch (error) {
    console.error("Error fetching snippets for user:", error);
    throw error;
  }
};


// Function to get all daily snippets for a specific user by their ID
const findDailySnippetsByUserId = async (userId) => {
  try {
    const userSnippets = await prisma.snipxSnippet.findMany({
      where: {
        user_id: parseInt(userId),
        type: "daily"  //user can only chose daily snippets to make a weekly report of
    },
      orderBy: { id: "desc" },
    });
    return userSnippets;
  } catch (error) {
    console.error("Error fetching snippets for user:", error);
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
  findSnippetsByUserId,
  updateSnippetById,
  deleteSnippetById,
  findDailySnippetsByUserId,
  
};
