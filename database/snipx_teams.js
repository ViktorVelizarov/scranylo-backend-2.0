const prisma = require("../utils/prisma");

// Fetch teams for a user
const getTeamsForUser = async (req, res) => {
  try {
    const userId = parseInt(req.query.userId, 10);

    if (isNaN(userId)) {
      return res.status(400).json({ message: "User ID is required and must be a number" });
    }

    const userCompanyRelation = await prisma.snipxUserCompany.findUnique({
      where: { user_id: userId },
      include: { company: true },
    });

    if (!userCompanyRelation || !userCompanyRelation.company) {
      return res.status(404).json({ message: "User or associated company not found" });
    }

    const companyId = userCompanyRelation.company_id;

    const teams = await prisma.snipxTeams.findMany({
      where: { company_id: companyId },
      include: {
        teamMembers: { include: { user: true } },
      },
    });

    const calculateAverageScore = async (userId) => {
      const snippets = await prisma.snipxSnippet.findMany({
        where: { user_id: userId },
        orderBy: { date: 'desc' },
        take: 5,
      });
      const scores = snippets.map(snippet => parseFloat(snippet.score) || 0);
      const averageScore = scores.length > 0 ? scores.reduce((acc, score) => acc + score, 0) / scores.length : 0;
      return averageScore;
    };

    const teamsWithAverageScores = await Promise.all(
      teams.map(async (team) => {
        const userIds = team.teamMembers.map(member => member.user_id);
        const userScores = await Promise.all(userIds.map(userId => calculateAverageScore(userId)));
        const averageScore = userScores.length > 0 ? userScores.reduce((acc, score) => acc + score, 0) / userScores.length : 0;
        return { ...team, average_score: averageScore };
      })
    );

    res.status(200).json(teamsWithAverageScores);
  } catch (error) {
    res.status(500).json({ message: "Internal server error" });
  }
};

// Create a new team and add users to it
const createTeam = async (req, res) => {
  try {
    const { teamName, userIds, currentUserId } = req.body;
    const userIdsInt = userIds.map(id => parseInt(id, 10));
    const currentUserIdInt = parseInt(currentUserId, 10);

    const currentUserCompany = await prisma.snipxUserCompany.findUnique({
      where: { user_id: currentUserIdInt },
    });

    if (!currentUserCompany) {
      return res.status(404).json({ message: "Current user or their company not found" });
    }

    const companyId = currentUserCompany.company_id;

    const newTeam = await prisma.snipxTeams.create({
      data: { team_name: teamName, company_id: companyId },
    });

    const userTeamPromises = userIdsInt.map(async (userId) => {
      const userCompany = await prisma.snipxUserCompany.findUnique({ where: { user_id: userId } });
      if (userCompany && userCompany.company_id === companyId) {
        return prisma.snipxUserTeam.create({ data: { user_id: userId, team_id: newTeam.id } });
      }
      return Promise.reject(new Error(`User with ID ${userId} is not in the same company.`));
    });

    await Promise.allSettled(userTeamPromises);

    res.status(201).json({ message: "Team created and users added successfully", team: newTeam });
  } catch (error) {
    res.status(500).json({ message: "Failed to create team and add users" });
  }
};

// Update team details
const updateTeam = async (req, res) => {
  try {
    const teamId = parseInt(req.params.id, 10);
    const { team_name, userIds } = req.body;

    if (isNaN(teamId)) {
      return res.status(400).json({ message: "Invalid team ID" });
    }

    const updatedTeam = await prisma.snipxTeams.update({
      where: { id: teamId },
      data: { team_name: team_name },
    });

    await prisma.snipxUserTeam.deleteMany({ where: { team_id: teamId } });

    const userTeamPromises = userIds.map(async (userId) => {
      const userIdInt = parseInt(userId, 10);
      const userCompany = await prisma.snipxUserCompany.findUnique({ where: { user_id: userIdInt } });
      if (userCompany) {
        return prisma.snipxUserTeam.create({ data: { user_id: userIdInt, team_id: teamId } });
      }
      return Promise.reject(new Error(`User with ID ${userIdInt} is not valid.`));
    });

    await Promise.allSettled(userTeamPromises);

    res.status(200).json({ message: "Team updated successfully", team: updatedTeam });
  } catch (error) {
    res.status(500).json({ message: "Failed to update team" });
  }
};

// Delete a team
const deleteTeam = async (req, res) => {
  try {
    const teamId = parseInt(req.params.id, 10);

    if (isNaN(teamId)) {
      return res.status(400).json({ message: "Invalid team ID" });
    }

    await prisma.snipxUserTeam.deleteMany({ where: { team_id: teamId } });
    await prisma.snipxTeams.delete({ where: { id: teamId } });

    res.status(200).json({ message: "Team deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: "Failed to delete team" });
  }
};

module.exports = {
  getTeamsForUser,
  createTeam,
  updateTeam,
  deleteTeam,
};
