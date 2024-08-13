const he = require('he');
const prisma = require("../utils/prisma");

// Function to add a snippet to the database
const AddSnippet = async ({ snipx_user_id, inputText, green, orange, red, explanations, score, sentiment}) => {
  try {
    // Decode HTML entities and Unicode sequences in the inputText
    const decodedText = he.decode(decodeURIComponent(inputText));


    const newSnippet = await prisma.snipxSnippet.create({
      data: {
        user_id: snipx_user_id,
        text: decodedText, 
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

module.exports = {
  findAllSnippets,
  AddSnippet, 
};
