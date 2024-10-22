const prisma = require("../utils/prisma");

// Get Skill Ratings for a User
const getUserRatings = async (req, res) => {
  const { userId } = req.params;
  console.log(`Fetching skill ratings for userId: ${userId}`);

  try {
    const ratings = await prisma.snipxRating.findMany({
      where: { user_id: parseInt(userId) },
      select: {
        score: true,
        created_at: true,
        skill: {
          select: { id: true },
        },
      },
    });

    console.log('Ratings fetched successfully:', ratings);
    res.status(200).json(ratings).end();
  } catch (error) {
    console.error("Failed to fetch ratings:", error);
    res.status(500).json({ error: "Failed to fetch ratings." }).end();
  }
};

// Create a new Skill Rating for a User
const createUserRating = async (req, res) => {
  const { userId } = req.params;
  const { skillId, score } = req.body;
  console.log(`Creating new rating for userId: ${userId}, skillId: ${skillId}, score: ${score}`);

  try {
    // Create a new rating
    const rating = await prisma.snipxRating.create({
      data: {
        user_id: parseInt(userId),
        skill_id: parseInt(skillId),
        score: score,
        created_at: new Date(), // Use the current timestamp
      },
    });

    console.log('Rating created successfully:', rating);
    res.status(200).json(rating).end();
  } catch (error) {
    console.error("Failed to create rating:", error);
    res.status(500).json({ error: "Failed to create rating." }).end();
  }
};

module.exports = {
  getUserRatings,
  createUserRating,
};
