const prisma = require("../utils/prisma");

// Get all user skill hours with user emails and skill names
const getUserSkillHours = async (req, res) => {
  try {
    const { id: userId } = req.body;
    console.log("Received user ID in /api/user-skill-hours:", userId);

    // Step 1: Find the user's company ID
    const userCompanyRelation = await prisma.snipxUserCompany.findUnique({
      where: { user_id: userId },
      select: { company_id: true },
    });

    if (!userCompanyRelation) {
      console.log("User does not belong to any company.");
      return res.status(200).json([]).end();
    }

    const companyId = userCompanyRelation.company_id;

    // Step 2: Get all users in the same company
    const companyUsers = await prisma.snipxUserCompany.findMany({
      where: { company_id: companyId },
      select: { user_id: true },
    });

    const userIds = companyUsers.map((relation) => relation.user_id);

    // Step 3: Fetch user skill hours for users in the same company
    const userSkillHours = await prisma.snipxUserSkillHours.findMany({
      where: { user_id: { in: userIds } },
      include: {
        user: {
          select: {
            email: true, // Include the user's email
          },
        },
        skill: {
          select: {
            skill_name: true, // Include the skill name
          },
        },
      },
    });

    console.log(`Retrieved ${userSkillHours.length} user skill hour records with emails and skill names.`);
    res.status(200).json(userSkillHours).end();
  } catch (error) {
    console.error("Error retrieving user skill hours:", error);
    res.status(500).send("Internal Server Error.").end();
  }
};


// Get Company ID for a User
const getUserCompany = async (req, res) => {
  const { userId } = req.params;

  try {
    const userCompany = await prisma.snipxUserCompany.findUnique({
      where: { user_id: parseInt(userId) },
      select: { company_id: true },
    });

    if (userCompany) {
      res.status(200).json({ companyId: userCompany.company_id }).end();
    } else {
      res.status(404).json({ error: "User not found or not associated with any company." }).end();
    }
  } catch (error) {
    console.error("Failed to fetch company ID:", error);
    res.status(500).json({ error: "Failed to fetch company ID." }).end();
  }
};

module.exports = {
  getUserSkillHours,
  getUserCompany,
};
