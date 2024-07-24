const prisma = require("../utils/prisma");

// get stats for all users that did QA also retrive data about all related users and candidates (their links)
const getDailyQAStats = async () => {
  const dailyQAStats = prisma.dailyQAStat.findMany({
    include: {
      userRelation: true,
      candidates: true,
    },
  });
  return dailyQAStats;
};

// This function is used to create a new entry in the daily QA stats
const createDailyQAStats = async (user, data) => {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const newDailyQAStats = await prisma.dailyQAStat.create({
    data: {
      user: user.id,
      date: today,
      totalReviewed: 1,
      candidates: {
        create: [
          {
            candidateURL: data.oldData.LIprofileNew
              ? data.oldData.LIprofileNew
              : data.oldData.LIprofileOld, //to identify uploading the same data again (for example QA found some mistake and desided to upload data for the same candidate again), save the link of the candidate you checked
          },
        ],
      },
    },
    include: {
      userRelation: true,
      candidates: true,
    },
  });
  return newDailyQAStats;
};

// This function is used to increment the total count of reviewed candidates for a particular user who is doing QA. If a user doesn't exist throw an error, if a daily QA stat for a user doesn't exist, it creates a new one. 
const increaseTotalReviewed = async (data) => {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  const ownerEmail = `${data.qaOwner.toLowerCase()}@scaleup.agency`;
  const user = await prisma.users.findFirst({ where: { email: ownerEmail } });
  if (!user) {
    throw new Error(`User with email: ${ownerEmail} does not exist`);
  }

  const existingDailyQAStats = await prisma.dailyQAStat.findFirst({
    where: { user: user.id, date: today },
    include: { userRelation: true, candidates: true },
  });

  if (!existingDailyQAStats) {
    // Create new daily QA stats if it doesn't exist
    return await createDailyQAStats(user, data);
  } else if (
    !existingDailyQAStats.candidates.some(
      (candidate) =>
        candidate.candidateURL === data.oldData.LIprofileNew ||
        candidate.candidateURL === data.oldData.LIprofileOld
    )
  ) {
    // If candidate's data haven't been checked yet, increment the total count and add the candidate
    const updatedDailyQAStats = await prisma.dailyQAStat.update({
      where: { id: existingDailyQAStats.id },
      data: {
        totalReviewed: {
          increment: 1,
        },
        candidates: {
          create: [
            {
              candidateURL: data.oldData.LIprofileNew
                ? data.oldData.LIprofileNew
                : data.oldData.LIprofileOld,
            },
          ],
        },
      },
      include: {
        userRelation: true,
        candidates: true,
      },
    });
    return updatedDailyQAStats;
  } else {
    return;
  }
};

module.exports = {
  getDailyQAStats,
  increaseTotalReviewed,
};
